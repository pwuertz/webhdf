########################################################################
# WebHDF server-side wsgi application
import os
import imp


root_local = ""
url_webhdf = "webhdf.wsgi"

try:
    script_path = os.path.dirname(os.path.abspath(__file__))
    conf = imp.load_source("config", os.path.join(script_path, "config.py"))
    root_local = conf.root_local
    url_webhdf = conf.url_webhdf
except:
    pass

html_template = """
<html>
<head>
    <title>HDF Web View</title>
    <meta charset='utf-8'>
    <link rel="stylesheet" type="text/css" href="webhdf.css" />
    <script type="text/javascript" src="jquery_1.9.1_xhr2patch.js"></script>
    <script type="text/javascript" src="ndarray.js"></script>
    <script type="text/javascript" src="imshow.js"></script>
    <script type="text/javascript" src="webhdf.js"></script>

    <link rel="stylesheet" href="jquery-ui-1.10.3.custom.min.css" />
    <script type="text/javascript" src="jquery-ui-1.10.3.custom.min.js"></script>
</head>
<body>
    <div id="webhdf_navigation"></div>
    <div id="webhdf_content"></div>
<script>
webhdf.load("{url_webhdf}", "{path}");
</script>
</body>
</html>
"""

########################################################################

from webob import Request, Response
from webob.exc import HTTPNotFound, HTTPInternalServerError
from webob.static import FileApp
from webob.dec import wsgify

import h5py
import numpy as np
import json
import itertools

def dtype2json(dtype):
    if not dtype.fields:
        return str(dtype)
    else:
        fields = {}
        for name in dtype.names:
            subdtype = dtype.fields[name][0]
            fields[name] = dtype2json(subdtype)
        return {"names": dtype.names, "fields": fields}

def response_file(path_local, fmt):
    if fmt == "raw":
        # return the raw h5 file
        fname = os.path.basename(path_local).encode('utf-8')
        res = FileApp(path_local,
                      content_disposition="attachment; filename=%s" % fname,
                      content_type="application/x-hdf")
        return res
    elif fmt == "json":
        # return json representation of the h5 header
        with h5py.File(path_local, "r") as fh:
            def dset_to_dict(dset, path, name):
                d = {}
                d["attrs"] = dict([x for x in dset.attrs.iteritems()])
                d["shape"] = dset.shape
                d["dtype"] = dtype2json(dset.dtype)
                d["name"] = name
                d["path"] = path
                return d

            def visit_group(group_obj, path, gname="/"):
                dsets = []
                groups = []
                for name, obj in group_obj.iteritems():
                    if isinstance(obj, h5py.Dataset):
                        dsets.append(dset_to_dict(obj, path+"/"+name, name))
                    else:
                        groups.append(visit_group(obj, path+"/"+name, name))
                g = {}
                g["attrs"] = dict([x for x in fh.attrs.iteritems()])
                g["groups"] = groups
                g["datasets"] = dsets
                g["path"] = path if path else "/"
                g["name"] = gname
                return g

            header = visit_group(fh, "")
            header["fname"] = os.path.basename(path_local)

        res = Response(content_type="application/json", charset="utf-8")
        res.body = json.dumps(header, indent=4, separators=(',', ': '))
        res.encode_content(encoding='gzip', lazy=True)
        return res
    else:
        return HTTPNotFound("Invalid format requested.")

def response_dset(path_local, dset, fmt):
    h5fh = h5py.File(path_local, "r")
    if dset not in h5fh:
        return HTTPNotFound("Dataset '%s' not found." % dset)
    dset = h5fh[dset]

    if fmt == "txt":
        # return the text representation from np.savetxt
        res = Response(content_type="text/plain", charset="utf-8")
        if dset.dtype.names:
            res.body += "#"+" ".join(dset.dtype.names)+"\n"
        np.savetxt(res.body_file, dset)
        res.encode_content(encoding='gzip', lazy=True)
        return res
    elif fmt == "py":
        # return python object representation of the data
        res = Response(content_type="text/plain", charset="utf-8")
        res.body = repr(dset[:])
        res.encode_content(encoding='gzip', lazy=True)
        return res
    elif fmt == "json":
        # return json representation
        res = Response(content_type="application/json", charset="utf-8")
        res.body = json.dumps(dset[:].tolist())
        res.encode_content(encoding='gzip', lazy=True)
        return res
    elif fmt == "raw":
        # return the original binary dataset
        res = Response(content_type="application/octet-stream")
        res.app_iter = DatasetIterator(h5fh, dset)
        res.content_length = res.app_iter.num_bytes()
        res.encode_content(encoding='gzip', lazy=True)
        return res
    else:
        return HTTPNotFound("Invalid format requested.")

class DatasetIterator:
    def __init__(self, h5fh, dset):
        self.h5fh = h5fh
        self.dset = dset

    def num_bytes(self):
        return np.prod(self.dset.shape) * self.dset.dtype.itemsize

    def __iter__(self):
        chunk_limit = 100 * 1024 # 100 KiB
        
        # number of dimensions that fit into chunk_limit
        shape = self.dset.shape
        ndims = len(shape)
        dim_sizes = np.cumprod(shape[::-1])[::-1] * self.dset.dtype.itemsize
        num_dims_below_limit = (dim_sizes < chunk_limit).sum()
        
        if num_dims_below_limit == ndims:
            # return the whole dataset and stop
            yield bytes(self.dset[:].data)
        else:
            # determine number of elements that fit into chunk_limit
            iter_dim = (ndims-1) - num_dims_below_limit
            elem_size = dim_sizes[iter_dim] / shape[iter_dim]
            elems_per_chunk = int(np.ceil(float(chunk_limit))/float(elem_size))
            chunks_per_iter_dim = int(np.ceil(float(shape[iter_dim])/float(elems_per_chunk)))
            
            # generate iterator over required dimensions
            print dim_sizes, num_dims_below_limit
            print "iterate over dim", iter_dim
            print elems_per_chunk, chunks_per_iter_dim
            ranges = [range(shape[i]) for i in range(iter_dim-1)] + [range(chunks_per_iter_dim)]
            for select in itertools.product(*ranges):
                from_ = select[-1] * elems_per_chunk
                to_ = from_ + elems_per_chunk
                select = select[:-1] + (slice(from_, to_),)
                yield bytes(self.dset[select].data)

def webhdf_application(environ, start_response):
    req = Request(environ)
    
    # get/sanitize path and check if requested file exists
    path = req.params.get("path", "").lstrip('/')
    if not path:
        res = HTTPNotFound("Missing path argument for hdf file.")
        return res(environ, start_response)
    path_local = os.path.normpath(os.path.join(root_local, path))
    if not os.path.isfile(path_local) or not path_local.startswith(root_local):
        res = HTTPNotFound("Requested hdf file not found.")
        return res(environ, start_response)

    # check requested format and dataset
    fmt = req.params.get("fmt")
    dset = req.params.get("dset")
    if not fmt:
        # if no format was given, send page created from html template
        res = Response()
        res.body = html_template.format(url_webhdf=url_webhdf, path=path)
        return res(environ, start_response)
    if dset is None:
        # if no dataset was selected, return hdf in the given format
        res = response_file(path_local, fmt)
        return res(environ, start_response)
    else:
        # return a dataset in the given format
        res = response_dset(path_local, dset, fmt)
        return res(environ, start_response)

@wsgify.middleware
def debug(req, app):
    try:
        res = req.get_response(app)
    except:
        import traceback
        err = traceback.format_exc()
        return HTTPInternalServerError(err)
    return res

application = debug(webhdf_application)
