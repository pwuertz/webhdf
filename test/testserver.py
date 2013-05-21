from wsgiref.simple_server import make_server
from webob.dec import wsgify
from webob.static import DirectoryApp
import urlparse
import imp
import os

path_httpd_root = ""

# serve files for /
path_httpd_root = os.path.abspath(path_httpd_root)
directory_root_app = DirectoryApp(path_httpd_root)
# serve files for /_webhdf
path_test = os.path.dirname(os.path.abspath(__file__))
path_webhdf = os.path.normpath(os.path.join(path_test, "..", "webhdf"))
directory_webhdf_app = DirectoryApp(path_webhdf)
# serve webhdf application
webhdf = imp.load_source("webhdf", os.path.join(path_webhdf, "webhdf.wsgi"))
webhdf.root_local = path_httpd_root
webhdf.url_webhdf = "/_webhdf/webhdf.wsgi"
webhdf_app = webhdf.application

# main application
@wsgify
def application(req):
    path_url = req.path_info
    path_local = os.path.normpath(os.path.join(path_httpd_root, req.path_info.lstrip('/')))
    if path_url == webhdf.url_webhdf:
        return webhdf_app
    elif path_url.startswith("/_webhdf"):
        req.path_info = path_url[len("/_webhdf"):]
        return directory_webhdf_app(req)
    elif os.path.isdir(path_local):
        path_url = (path_url + "/").lstrip('/')
        dirs = [f for f in os.listdir(path_local) if os.path.isdir(os.path.join(path_local, f))]
        dir_links = ["<a href='/{0}'>{1}</a>".format(urlparse.urljoin(path_url, d), d) for d in dirs]
        hdfs = [f for f in os.listdir(path_local) if (f.endswith(".h5") or f.endswith(".hdf5") or f.endswith(".hdf"))]
        hdf_links = ["<a href='{2}?path=/{0}'>{1}</a>".format(urlparse.urljoin(path_url, f), f, webhdf.url_webhdf) for f in hdfs]
        return "<br/>\n".join(dir_links + hdf_links)
    else:
        return directory_root_app(req)

httpd = make_server('', 8000, application)
print "Serving on port 8000..."
httpd.serve_forever()
