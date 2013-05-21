
var imshow = (function (){
	var colormaps = {
		wjet: {
			r: [1.0, 0.2, 0.0, 0.0, 0.5, 1.0, 1.0, 1.0],
			g: [1.0, 0.3, 0.5, 1.0, 1.0, 1.0, 0.3, 0.0],
			b: [1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0],
		},
		jet: {
			r: [0.0, 0.0, 0.0, 0.5, 1.0, 1.0],
			g: [0.0, 0.0, 1.0, 1.0, 1.0, 0.0],
			b: [0.5, 1.0, 1.0, 0.3, 0.0, 0.0],
		},
		hot: {
			r: [0.0, 0.8, 1.0, 1.0],
			g: [0.0, 0.0, 0.9, 1.0],
			b: [0.0, 0.0, 0.0, 1.0],
		},
		gray: {
			r: [0.0, 1.0],
			g: [0.0, 1.0],
			b: [0.0, 1.0],
		},
		bwr: {
			r: [0.2298057, 0.26623388, 0.30386891, 0.342804478, 0.38301334, 0.424369608, 0.46666708, 0.509635204, 0.552953156, 0.596262162, 0.639176211, 0.681291281, 0.722193294, 0.761464949, 0.798691636, 0.833466556, 0.865395197, 0.897787179, 0.924127593, 0.944468518, 0.958852946, 0.96732803, 0.969954137, 0.966811177, 0.958003065, 0.943660866, 0.923944917, 0.89904617, 0.869186849, 0.834620542, 0.795631745, 0.752534934, 0.705673158],
			g: [0.298717966, 0.353094838, 0.406535296, 0.458757618, 0.50941904, 0.558148092, 0.604562568, 0.648280772, 0.688929332, 0.726149107, 0.759599947, 0.788964712, 0.813952739, 0.834302879, 0.849786142, 0.860207984, 0.86541021, 0.848937047, 0.827384882, 0.800927443, 0.769767752, 0.734132809, 0.694266682, 0.650421156, 0.602842431, 0.551750968, 0.49730856, 0.439559467, 0.378313092, 0.312874446, 0.24128379, 0.157246067, 0.01555616],
			b: [0.753683153, 0.801466763, 0.84495867, 0.883725899, 0.917387822, 0.945619588, 0.968154911, 0.98478814, 0.995375608, 0.999836203, 0.998151185, 0.990363227, 0.976574709, 0.956945269, 0.931688648, 0.901068838, 0.865395561, 0.820880546, 0.774508472, 0.726736146, 0.678007945, 0.628751763, 0.579375448, 0.530263762, 0.481775914, 0.434243684, 0.387970225, 0.343229596, 0.300267182, 0.259301199, 0.220525627, 0.184115123, 0.150232812],
		},
	}
	
	/**
	 * Create an offscreen canvas and draw a colormapped image from data.
	 * 
	 * @param {TypedArray} array - image data
	 * @param {Number} width - width of the array
	 * @param {Number} height - height of the array
	 * @param {Object} options
	 * ... {Number} vmin - value mapped to the minimum (default 0)
	 * ... {Number} xmax - value mapped to the maximum (default "auto")
	 * ... {Number} cmap - colormap definition (default "jet")
	 */
	function createCanvas(array, width, height, options) {
		options = (typeof options === "undefined") ? {} : options;
		var vmax = (typeof options.vmax === "undefined") ? "auto" : options.vmax;
		var vmin = (typeof options.vmin === "undefined") ? 0 : options.vmin;
		var cmap = (typeof options.cmap === "undefined") ? "jet" : options.cmap;
		if (typeof cmap === "string") {cmap = colormaps[cmap];}
	
		if (vmax === "auto") {
			vmax = -Infinity;
			for (var i=0; i < array.length; i++) {
				if (isFinite(array[i])) vmax = Math.max(vmax, array[i]);
			};
		}
		if (vmin === "auto") {
			vmin = Infinity;
			for (var i=0; i < array.length; i++) {
				if (isFinite(array[i])) vmin = Math.min(vmin, array[i]);
			};
		}
		
		var offscreen_canvas = document.createElement('canvas');
		offscreen_canvas.width = width;
		offscreen_canvas.height = height;
		var ctx = offscreen_canvas.getContext("2d");
		var img = ctx.getImageData(0, 0, width, height);
		
		var cstops = cmap.r.length;
		var scalef = (cstops-1) / (vmax-vmin);
		
		var cmapr = new Float64Array(cmap.r);
		var cmapg = new Float64Array(cmap.g);
		var cmapb = new Float64Array(cmap.b);
	
		for (var i = 0, j = 0; j < array.length; i += 4, j++) {
			if (!isFinite(array[j])) continue;
			var val = Math.max(scalef * (array[j]-vmin), 0);
			var c1 = Math.floor(Math.min(val   , cstops-1));
			var c2 = Math.floor(Math.min(val+1., cstops-1));
			var f = val - c1;
			img.data[i    ] = (cmapr[c1]*(1.-f) + cmapr[c2]*f) * 255;
			img.data[i + 1] = (cmapg[c1]*(1.-f) + cmapg[c2]*f) * 255;
			img.data[i + 2] = (cmapb[c1]*(1.-f) + cmapb[c2]*f) * 255;
			img.data[i + 3] = 255;
		}
		ctx.putImageData(img, 0, 0);
		return offscreen_canvas;
	}
	
	return {
		createCanvas: createCanvas,
		cmaps: Object.keys(colormaps),
	};

})();
