//
//
//

var webhdf = (function() {

	var settings = {
		title: "HDF View",
		ds_style_txt: 0,
		ds_style_img: 0,
		url: "",
		fname: "",
		fpath: "",
		root_group: {},
	}

	var div_navigation;
	var div_content;

	function load(url, path) {
		div_navigation = document.getElementById("webhdf_navigation");
		div_content = document.getElementById("webhdf_content");

		args = {
			path: path,
			fmt: "json"
		};
		$.ajax({
			dataType: "json",
			url: url,
			data: args,
			success: function(data) {
				settings.url = url;
				settings.fname = data.fname;
				settings.fpath = path;
				settings.root_group = initDataStructure(data);

				buildNavigation();
				setGroupContent(settings.root_group);
				document.title = settings.title + " - " + settings.fname;
			},
			error: function(jqXHR, textStatus, errorThrown) {
				alert("Error loading HDF file: " + textStatus);
			}
		});
	}

	function initDataStructure(data_json) {
		function visit_group(group) {
			group.groups.forEach(function(sub_group) {
				visit_group(sub_group);
			});
			group.datasets.forEach(function(dataset) {
				dataset.dtype = ndarray.createDtypeFromJson(dataset.dtype);
				dataset.data = null;
			});
		}
		visit_group(data_json);
		return data_json;
	}

	function buildNavigation() {
		div_navigation.innerHTML = "";
		addGroupToNavigation(settings.root_group, div_navigation);
	}

	function addGroupToNavigation(group, parent) {
		// add a new link for the group to parent
		var div = document.createElement("div");
		parent.appendChild(div);
		div.className = "webhdf_nav_group";
		div.innerHTML = "<div class='webhdf_nav_item'><span class='webhdf_nav_group_name'>" + group.name + "</span></div>";
		$(div).children(":first").click(function() {
			$(div_content).fadeOut(250, function() {
				setGroupContent(group);
				$(div_content).fadeIn(350);
			});
		});
		// add sub-groups and datasets
		group.groups.forEach(function(sub_group) {
			addGroupToNavigation(sub_group, div);
		});
		group.datasets.forEach(function(dataset) {
			addDatasetToNavigation(dataset, div);
		});
	}

	function addDatasetToNavigation(dataset, parent) {
		// add a new link for the dataset to parent
		var div_dataset = document.createElement("div");
		parent.appendChild(div_dataset);
		div_dataset.className = "webhdf_nav_dataset";
		div_dataset.innerHTML = "<div class='webhdf_nav_item'><span class='webhdf_nav_dataset_name'>" + dataset.name + "</span></div>";
		$(div_dataset).children(":first").click(function() {
			$(div_content).fadeOut(250, function() {
				setDatasetContent(dataset);
				$(div_content).fadeIn(350);
			});
		});
	}

	function createAttributesDiv(attrs) {
		var div = document.createElement("div");
		if (!$.isEmptyObject(attrs)) {
			div.className = "webhdf_content webhdf_attrs";
			var a = $.map(attrs, function(v, k) {
				return k + "=" + v;
			});
			div.innerHTML = a.join("; ");
		}
		return div;
	}

	function createDatasetInfoDiv(dataset) {
		var div = document.createElement("div");
		div.className = "webhdf_content webhdf_dsinfo";
		var shape_str = dataset.shape.join("x");
		var dtype_str = dataset.dtype.toString();
		div.innerHTML = "(" + shape_str + ") - " + dtype_str;
		return div;
	}

	function formatData(dataset, fmt) {
		// get data as nested array
		var data = (dataset.data instanceof Array) ? dataset.data : ndarray.createNestedArray(dataset.data, dataset.shape);

		// define formats for ndimensional representation
		var ndfmt;
		if (fmt == "[]") {
			ndfmt = {
				open: ["["],
				close: ["]"],
				sep: [", "]
			};
		} else if (fmt == "{}") {
			ndfmt = {
				open: ["{"],
				close: ["}"],
				sep: [", "]
			};
		} else if (fmt == "txt") {
			ndfmt = {
				open: [""],
				close: [""],
				sep: ["\n", " "]
			};
		} else if (fmt == "html") {
			if (dataset.shape.length === 1 && dataset.dtype instanceof ndarray.DtypeRecord) {
				var header = "<tr><th></th><th>" + dataset.dtype.names.join("</th><th>") + "</th></tr>";
			} else {
				var header = "";
			}
			ndfmt = {
				open: ["<table class='webhdf_table'>" + header + "<tr><td></td><td>", ""],
				close: ["</td></tr></table>", ""],
				sep: ["</td></tr>\n<tr><td></td><td>", "</td><td>", ", "]
			};
		}
		// return formatted array
		return ndarray.nestedArrayToString(data, ndfmt);
	}

	function setGroupContent(group) {
		div_content.innerHTML = "<div class='webhdf_title'></div>";
		div_content.appendChild(createAttributesDiv(group.attrs));

		if (group.name != "/") {
			$(".webhdf_title", div_content).text("Group: " + group.name);
		} else {
			$(".webhdf_title", div_content).text(settings.fname);
			var div = document.createElement("div");
			div.className = "webhdf_content";
			div.innerHTML = "Download <a class='webhdf_link' href='" + settings.url + "?path=" + settings.fpath + "&" + "fmt=raw'>" + settings.fname + "</a>";
			div_content.appendChild(div);
		}
	}

	function setDatasetContent(dataset) {
		div_content.innerHTML = "<div class='webhdf_title'></div>";
		div_content.firstChild.innerHTML = "Dataset: " + dataset.name;
		div_content.appendChild(createDatasetInfoDiv(dataset));
		div_content.appendChild(createAttributesDiv(dataset.attrs));

		// if data is not present, try to load it and return
		if (!dataset.data) {
			// add loading animation
			var div_loading = document.createElement("div");
			div_loading.innerHTML = "<img src='icons/ajax-loader.gif' style='margin:20px'/>";
			div_content.appendChild(div_loading);
			var show_error = function(xhr, status, thrown) {
				div_loading.innerHTML = "Could not load data: " + status;
			};
			// load dataset
			var args = {
				path: settings.fpath,
				dset: dataset.path,
			};
			if (dataset.dtype.isSupported()) {
				args.fmt = "raw";
				var show_data = function(data) {
					dataset.data = ndarray.createViewFromBuffer(data, dataset.dtype);
					if (dataset.data) {
						setDatasetContent(dataset);
					}
				};
				$.ajax({
					dataType: "binary",
					xhrFields: {
						responseType: 'arraybuffer'
					},
					url: settings.url,
					data: args,
					error: show_error,
					success: show_data,
				});
			} else {
				args.fmt = "json";
				var show_data = function(data) {
					dataset.data = data;
					if (dataset.data) {
						setDatasetContent(dataset);
					}
				};
				$.ajax({
					dataType: "json",
					url: webhdf.url,
					data: args,
					error: show_error,
					success: show_data,
				});
			}
			return;
		}

		// if dataset is already present, display as text or image
		if ("CLASS" in dataset.attrs && dataset.attrs["CLASS"] == "IMAGE") {
			var div = createDatasetAsImageDiv(dataset);
			div_content.appendChild(div);
		} else {
			var div = createDatasetAsTextDiv(dataset);
			div_content.appendChild(div);
		}
	}

	function createDatasetAsTextDiv(dataset) {
		var div = document.createElement("div");
		
		// create div containing links for switching format
		var div_formats = document.createElement("div");
		div_formats.className = "webhdf_content";
		var fmts = ["[]", "{}", "txt", "html"];
		var links = $.map(fmts, function(fmt) {
			return "<a class='webhdf_link'>" + fmt + "</a>";
		});
		div_formats.innerHTML = "Format: " + links.join(" | ");
		div.appendChild(div_formats);
		
		// create div containing the dataset
		var div_dataset = document.createElement("div");
		div.appendChild(div_dataset);
		
		// add handlers for switching the dataset format
		$(div_formats).on("click", "a", function() {
			settings.ds_style_txt = $(this).index();
			var fmt = fmts[settings.ds_style_txt];
			if (fmt != "html") {
				var $box = $("<textarea readonly class='webhdf_textarea'></textarea>");
				$box.text(formatData(dataset, fmt));
			} else {
				var $box = $(formatData(dataset, "html"));
			}
			div_dataset.innerHTML = "";
			$box.appendTo(div_dataset);
		});
		$("a:eq(" + settings.ds_style_txt + ")", div_formats).click();
		return div;
	}

	function createDatasetAsImageDiv(dataset) {
		var div = document.createElement("div");
		var width = dataset.shape[1];
		var height = dataset.shape[0];
		
		// append div for control elements
		var div_controls = document.createElement("div");
		var cmaps = imshow.cmaps; // ["jet", "wjet", "hot", "bwr", "gray"]
		var cmap_links = $.map(cmaps, function(cmap) {
			return "<a class='webhdf_link'>" + cmap + "</a>";
		});
		div_controls.innerHTML = cmap_links.join(" | ");
		div_controls.innerHTML += "<div id='scale-slider'></div>";
		div.appendChild(div_controls);
		
		// append div containing the image canvas
		var div_image = document.createElement("div");
		div_image.className = "webhdf_image_container";
		var canvas = document.createElement("canvas");
		canvas.className = "webhdf_image";
		canvas.width = width;
		canvas.height = height;
		div_image.appendChild(canvas);
		div.appendChild(div_image);

		// init slider for scaling
		$("#scale-slider", div_controls).slider({
			min: 10,
			max: 100,
			value: 100,
			slide: function(event, ui) {
				canvas.style.width = String(ui.value) + "%";
			}
		});
		// add handlers for switching colormap
		$(div_controls).on("click", "a", function() {
			settings.ds_style_img = $(this).index();
			var image = imshow.createCanvas(dataset.data, width, height, {
				cmap: cmaps[settings.ds_style_img]
			});
			var ctx = canvas.getContext("2d");
			ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
		});
		$("a:eq(" + settings.ds_style_img + ")", div_controls).click();
		return div;
	}

	return {
		settings: settings,
		load: load,
	};
})();
