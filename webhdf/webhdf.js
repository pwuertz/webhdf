//
//
//

var webhdf = {
    title: "HDF View",
    ds_style: 0,
    ds_imstyle: 0,
    url: "",
    fname: "",
    fpath: "",
    root: {},
};

function webhdf_load(url, path) {
    args = {"path": path, "fmt": "json"};
    $.ajax({dataType: "json", url: url, data: args, success: function(data) {
        webhdf.url = url;
        webhdf.fname = data.fname;
        webhdf.fpath = path;
        webhdf.root = data;
        
        var nav_div = $("#webhdf_navigation")[0];
        webhdf_nav_render_group(webhdf.root, nav_div);
        $(nav_div).fadeIn(300);
        webhdf_content_render_group(webhdf.root);
        document.title = webhdf.title + " - " + webhdf.fname;
    }, error: function(jqXHR, textStatus, errorThrown) {
        alert("Request error: "+textStatus);
    }});
}

function webhdf_nav_render_group(group, html_parent) {
    var div_group = document.createElement("div");
    $(div_group).addClass("webhdf_nav_group")
    html_parent.appendChild(div_group);
    var name = group.name;
    div_group.innerHTML = "<div class='webhdf_nav_item'><span class='webhdf_nav_group_name'>"+name+"</span></div>";
    $(div_group).children(":first").click(function () {
        $("#webhdf_content").fadeOut(250, function () {
            webhdf_content_render_group(group);
            $("#webhdf_content").fadeIn(350);
        });
    });
    
    // ouput all groups in this group
    for (var i=0; i < group.groups.length; ++i) {webhdf_nav_render_group(group.groups[i], div_group);}
    // ouput all datasets in this group
    for (var i=0; i < group.datasets.length; ++i) {webhdf_nav_render_dataset(group.datasets[i], div_group);}
}

function webhdf_nav_render_dataset(ds, html_parent) {
    var div_dset = document.createElement("div");
    $(div_dset).addClass("webhdf_nav_dataset")
    html_parent.appendChild(div_dset);
    div_dset.innerHTML = "<div class='webhdf_nav_item'><span class='webhdf_nav_dataset_name'>"+ds.name+"</span></div>";
    $(div_dset).children(":first").click(function () {
        $("#webhdf_content").fadeOut(250, function () {
            webhdf_content_render_dataset(ds);
            $("#webhdf_content").fadeIn(350);
        });
    });
}

function webhdf_div_attrs(attrs) {
    var div = document.createElement("div");
    if (!$.isEmptyObject(attrs)) {
        div.className = "webhdf_content webhdf_attrs";
        var a = $.map(attrs, function (v, k) {
            return k+"="+v;
        });
        div.innerHTML = a.join("; ");   
    }
    return div;
}

function webhdf_div_dsinfo(ds) {
    var div = document.createElement("div");
    div.className = "webhdf_content webhdf_dsinfo";
    div.innerHTML = "("+ds.shape.join("x")+")" + " - ";
    if (ds.dtype instanceof Array) {
        var recs = $.map(ds.dtype, function (d) {
            return d.field+": "+d.dtype;
        })
        div.innerHTML += "["+recs.join(", ")+"]";
    } else {
        div.innerHTML += ds.dtype;
    }
    return div;
}

function webhdf_format_data(dset, fmt) {
	// if data is a buffer, convert to nested array
	var data;
	if (dset.databuffer) {
		if (dset.dtype instanceof Array) {
			data = recarray_to_nested(dset.databuffer, dset.shape, dset.dtype);
		} else {
			var ViewClass = dtype_map[dset.dtype].View;
			var view = new ViewClass(dset.databuffer);
			data = ndarray_to_nested(view, dset.shape);
		}
	} else if (dset.data) {
		data = dset.data;
	} else {
		return "";
	}
	
	// define ndimensional formats
	var ndfmt;
	if (fmt == "[]") {
		ndfmt = {open: ["["], close: ["]"], sep: [", "]};
	} else if (fmt == "{}") {
		ndfmt = {open: ["{"], close: ["}"], sep: [", "]};
	} else if (fmt == "txt") {
		ndfmt = {open: [""], close: [""], sep: ["\n", " "]};
	} else if (fmt == "html") {
		if (dset.shape.length === 1 && dset.dtype instanceof Array) {
		        var names = $.map(dset.dtype, function (d) {return d.field});
			var header = "<tr><th></th><th>" + names.join("</th><th>") + "</th></tr>";
		} else {
			var header = "";
		}
		ndfmt = {open: ["<table class='webhdf_table'>"+header+"<tr><td></td><td>", ""],
		         close: ["</td></tr></table>", ""], sep: ["</td></tr>\n<tr><td></td><td>", "</td><td>", ", "]};
	}
	// return formatted array
	return ndarray_nested_stringify(data, ndfmt);
}

function webhdf_content_render_group(group) {
    var content_div = $("#webhdf_content")[0];
    content_div.innerHTML = "<div class='webhdf_title'></div>";
    content_div.appendChild(webhdf_div_attrs(group.attrs));

    if (group.name != "/") {
        $(".webhdf_title", content_div).text("Group: "+group.name);
    } else {
        $(".webhdf_title", content_div).text(webhdf.fname);
        var div = document.createElement("div");
        div.className = "webhdf_content";
        div.innerHTML = "Download <a class='webhdf_link' href='"+webhdf.url+"?path="+webhdf.fpath+"&"+"fmt=raw'>"+webhdf.fname+"</a>";
        content_div.appendChild(div);
    }
}

function webhdf_content_render_dataset(dset) {
    var content_div = $("#webhdf_content")[0];
    content_div.innerHTML = "<div class='webhdf_title'></div>";
    $(".webhdf_title", content_div).text("Dataset: "+dset.name);

    content_div.appendChild(webhdf_div_dsinfo(dset));
    content_div.appendChild(webhdf_div_attrs(dset.attrs));
    
    // if data is not present, try to load it and return
    if (!(dset.data || dset.databuffer)) {
    	// add loading animation
    	var div_loading = document.createElement("div");
    	div_loading.innerHTML = "<img src='icons/ajax-loader.gif' style='margin:20px'/>";
    	content_div.appendChild(div_loading);
    	function error(xhr, status, thrown) {
    		div_loading.innerHTML = "Could not load data: " + status;
    	}
    	// load dataset
    	if (isSupportedDtype(dset.dtype)) {
    		var args = {path: webhdf.fpath, dset: dset.path, fmt: "raw"};
    		$.ajax({dataType: "binary", xhrFields: {responseType : 'arraybuffer'}, url: webhdf.url,
    		        data: args, error: error, success: function(data) {
    			dset.databuffer = data;
    			console.log("xhr2 binary: " + data.byteLength + " bytes");
    			webhdf_content_render_dataset(dset);
    		}});
    	} else {
    		var args = {path: webhdf.fpath, dset: dset.path, fmt: "json"};
    		$.ajax({dataType: "json", url: webhdf.url, data: args, error: error, success: function(data) {
    			dset.data = data;
    			webhdf_content_render_dataset(dset);
    		}});
    	}
    	return;
    }
    
    // if dataset is already present, display as text or image
    if ("CLASS" in dset.attrs && dset.attrs["CLASS"] == "IMAGE") {
    	content_div.appendChild(webhdf_div_image_representation(dset));
    } else {
        content_div.appendChild(webhdf_div_text_representation(dset));
    }
}

function webhdf_div_text_representation(dset) {
    var div = document.createElement("div");
    var $tree = $("<div>"+
                  "<a class='webhdf_link'>[]-style</a> | "+
                  "<a class='webhdf_link'>{}-style</a> | "+
                  "<a class='webhdf_link'>txt-style</a> | "+
                  "<a class='webhdf_link'>html</a> "+
                  "</div>"+
                  "<div id='dataset'></div>");
    $tree.appendTo(div);
    var div_controls = $tree[0];
    var div_dataset = $tree[1];
    var fmts = ["[]", "{}", "txt", "html"];
    $(div_controls).on("click", "a", function(){
        webhdf.ds_style = $(this).index();
        var fmt = fmts[webhdf.ds_style];
        if (fmt != "html") {
            var $box = $("<textarea readonly class='webhdf_textarea'></textarea>");
            $box.text(webhdf_format_data(dset, fmt));
        } else {
            var $box = $(webhdf_format_data(dset, "html"));
        }
        $(div_dataset).empty();
        $box.appendTo(div_dataset);
    });
    $("a:eq("+webhdf.ds_style+")", div_controls).click();
    return div;
}

function webhdf_div_image_representation(dset) {
    var div = document.createElement("div");
    var $tree = $("<div>"+
                  "<a class='webhdf_link'>jet</a> | "+
                  "<a class='webhdf_link'>wjet</a> | "+
                  "<a class='webhdf_link'>hot</a> | "+
                  "<a class='webhdf_link'>bwr</a> | "+
                  "<a class='webhdf_link'>gray</a> "+
                  "<div id='scale-slider' style='width: 100px; display:inline-block; margin-left: 10px'></div>"+
                  "</div>"+
                  "<div style='margin: 10px; width: 90%'><canvas width='"+dset.shape[1]+"' height='"+dset.shape[0]+"' style='width: 100%; height: auto; border: 1px solid #444'></canvas></div>");
    $tree.appendTo(div);
    var div_controls = $tree[0];
    var canvas = $("canvas", $tree[1])[0];
    canvas.width = dset.shape[1];
    canvas.height = dset.shape[0];
    // scaling
    $("#scale-slider",$tree).slider({min: 10, max: 100, value: 100, slide: function(event, ui){
    	$(canvas).css("width", String(ui.value)+"%");
    }});
    // drawing
    var cmaps = ["jet", "wjet", "hot", "bwr","gray"];
    $(div_controls).on("click", "a", function(){
    	webhdf.ds_imstyle = $(this).index();
    	var ViewClass = dtype_map[dset.dtype].View;
        var view = new ViewClass(dset.databuffer);
    	var image = ndarray_to_canvas(view, dset.shape[1], dset.shape[0], {cmap: cmaps[webhdf.ds_imstyle]});
    	var ctx = canvas.getContext("2d");
    	ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    });
    $("a:eq("+webhdf.ds_imstyle+")", div_controls).click();
    return div;
}
