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
from webob.exc import HTTPTemporaryRedirect, HTTPNotFound, HTTPInternalServerError
from webob.static import FileApp
from webob.dec import wsgify

import h5py
import numpy
import cStringIO
import json
import gzip

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
        return res
    else:
        return HTTPNotFound("Invalid format requested.")

def response_dset(path_local, dset, fmt):
    with h5py.File(path_local, "r") as fh:
        if dset not in fh:
            return HTTPNotFound("Dataset '%s' not found." % dset)
        data = numpy.array(fh[dset])

    if fmt == "txt":
        # return the text representation from np.savetxt
        output = cStringIO.StringIO()
        numpy.savetxt(output, data)
        
        res = Response(content_type="text/plain", charset="utf-8")
        if data.dtype.names:
            res.body += "#"+" ".join(data.dtype.names)+"\n"
        res.body += output.getvalue()
        return res
    elif fmt == "py":
        # return python object representation of the data
        res = Response(content_type="text/plain", charset="utf-8")
        res.body = repr(data)
        return res
    elif fmt == "json":
        # return json representation
        res = Response(content_type="application/json", charset="utf-8")
        res.body = json.dumps(data.tolist())
        return res
    elif fmt == "raw":
        # return the original binary dataset
        res = Response(content_type="application/octet-stream", charset="utf-8")
        res.body = bytes(data.data)
        return res
    else:
        return HTTPNotFound("Invalid format requested.")

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
def debug_compress(req, app):
    try:
        res = req.get_response(app)
        if res.content_length > 10000 and "gzip" in req.accept_encoding:
            buffer = cStringIO.StringIO()
            gzf = gzip.GzipFile(fileobj=buffer, mode='w')
            gzf.write(res.body)
            gzf.close()
            res.content_encoding = 'gzip'
            res.body = buffer.getvalue()
    except:
        import traceback
        err = traceback.format_exc()
        return Response(body=err, content_type="text/plain", status=500)
    return res

application = debug_compress(webhdf_application)
