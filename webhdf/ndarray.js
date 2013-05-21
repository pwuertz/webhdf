/*
 * Utilities for handling binary data.
 */

var ndarray = (function (){
	
	var DTYPE_MAP = {
		int8: {View: Int8Array, size: 1, getter: DataView.prototype.getInt8},
		uint8: {View: Uint8Array, size: 1, getter: DataView.prototype.getUint8},
		int16: {View: Int16Array, size: 2, getter: DataView.prototype.getInt16},
		uint16: {View: Uint16Array, size: 2, getter: DataView.prototype.getUint16},
		int32: {View: Int32Array, size: 4, getter: DataView.prototype.getInt32},
		uint32: {View: Uint32Array, size: 4, getter: DataView.prototype.getUint32},
		float32: {View: Float32Array, size: 4, getter: DataView.prototype.getFloat32},
		float64: {View: Float64Array, size: 8, getter: DataView.prototype.getFloat64},
	}
	
	function DtypeSimple(type_str) {
		if (!this instanceof DtypeSimple) {
			return new DtypeSimple(type_str);
		}
		this.type = type_str;
	}

	DtypeSimple.prototype.isSupported = function() {
		return (this.type in DTYPE_MAP);
	}

	DtypeSimple.prototype.getSize = function() {
		return DTYPE_MAP[this.type].size;
	}
	
	DtypeSimple.prototype.toString = function() {
		return this.type;
	}
	
	function DtypeRecord(names, dtypes) {
		if (!this instanceof DtypeRecord) {
			return new DtypeRecord(names, dtypes);
		}
		this.names = names;
		this.dtypes = dtypes;
	}
	
	DtypeRecord.prototype.isSupported = function() {
		var is_supported = true;
		for (var i=0; i < this.dtypes.length; i++) {
			is_supported = is_supported && this.dtypes[i].isSupported();
		}
		return is_supported;
	}

	DtypeRecord.prototype.getSize = function() {
		var size = 0;
		for (var i=0; i < this.dtypes.length; i++) {
			size += this.dtypes[i].getSize();
		}
		return size;
	}

	DtypeRecord.prototype.toString = function() {
		var fields = [];
		for (var i=0; i < this.dtypes.length; i++) {
			fields.push(this.names[i] + ": " + this.dtypes[i].toString());
		}
		return "{" + fields.join(", ") + "}";
	}
	
	function createGetterForDtype(dtype, base_offset) {
		if (dtype instanceof DtypeSimple) {
			// return the getter for a native dtype
			var getter = DTYPE_MAP[dtype.type].getter;
			return function(data_view, offset) {
				// force little-endian for now
				return getter.call(data_view, base_offset+offset, true);
			}
		} else {
			// build list of getters for all fields
			var rec_offset = 0;
			var getters = [];
			for (var i=0; i < dtype.dtypes.length; i++) {
				getters.push(createGetterForDtype(dtype.dtypes[i], base_offset+rec_offset));
				rec_offset += dtype.dtypes[i].getSize();
			}
			// return a getter for the record
			return function(data_view, offset) {
				var record = [];
				for (var i=0; i < getters.length; i++) {
					record.push(getters[i](data_view, offset));
				};
				return record;
			}
		}
	}
	
	function RecordArray(buffer, dtype) {
		this.data_view = new DataView(buffer);
		this.getter = createGetterForDtype(dtype, 0);
		this.record_size = dtype.getSize();
		this.dtype = dtype;
	}
	
	RecordArray.prototype.get = function (i) {
		var offset = this.record_size * i;
		return this.getter(this.data_view, offset);
	}
	
	function createDtypeFromJson(dtype_json) {
		if (typeof dtype_json === "string") {
			return new DtypeSimple(dtype_json);
		} else {
			var dtypes = [];
			dtype_json.names.forEach(function (name) {
				dtypes.push(createDtypeFromJson(dtype_json.fields[name]));
			});
			return new DtypeRecord(dtype_json.names, dtypes);
		}
	}
	
	function createViewFromBuffer(buffer, dtype) {
		if (dtype instanceof DtypeSimple && dtype.isSupported()) {
			var TypedArray = DTYPE_MAP[dtype.type].View;
			return new TypedArray(buffer);
		} else if (dtype instanceof DtypeRecord && dtype.isSupported()) {
			return new RecordArray(buffer, dtype);
		} else {
			return null;
		}
	}
	
	function array_to_nested(data, dims) {
		function __axis_to_array(axis, offset) {
			if (axis == dims.length-1) {
				var a = [];
				for (var i=0; i < dims[axis]; i++) {
					a.push(data[i+offset]);
				}
				return a;
			} else {
				var a = [];
				for (var i=0; i < dims[axis]; i++) {
					a.push(__axis_to_array(axis+1, offset));
					offset += dims[axis+1];
				}
				return a;
			}
		}
		return __axis_to_array(0, 0);
	}

	function recarray_to_nested(data, dims) {
		function __axis_to_array(axis, offset) {
			if (axis == dims.length-1) {
				var a = [];
				for (var i=0; i < dims[axis]; i++) {
					a.push(data.get(i+offset));
				}
				return a;
			} else {
				var a = [];
				for (var i=0; i < dims[axis]; i++) {
					a.push(__axis_to_array(axis+1, offset));
					offset += dims[axis+1];
				}
				return a;
			}
		}
		return __axis_to_array(0, 0);
	}
	
	/**
	 * Return a nested n-dimensional array from a TypedArray
	 * or RecordArray.
	 * 
	 * @param {(TypedArray|RecordArray)} data - array to be converted.
	 * @param {Array} dims - sizes of the dimensions.
	 */
	function createNestedArray(data, dims) {
		if (data instanceof RecordArray) {
			return recarray_to_nested(data, dims);
		} else {
			return array_to_nested(data, dims);
		}
	}
	
	/**
	 * Return a string representation of a nested Array.
	 * 
	 * @param {Array} data - nested array to be printed.
	 * @param {Array} ndformat - format strings for each dimension.
	 */
	function nestedArrayToString(data, ndformat) {
		if (typeof ndformat === "undefined") {
			ndformat = {open: ["["], close: ["]"], sep: [", "]};
		}
	
		function __axis_to_str(subdata, axis) {
			var txt = "";
			if (!(subdata instanceof Array)) {
				return JSON.stringify(subdata);
			} else {
				var sopen = ndformat.open[Math.min(axis, ndformat.open.length-1)];
				var sclose = ndformat.close[Math.min(axis, ndformat.close.length-1)];
				var ssep = ndformat.sep[Math.min(axis, ndformat.sep.length-1)];
	
				txt += sopen + __axis_to_str(subdata[0], axis+1);
				for (var i=1; i < subdata.length; i++) {
					txt += ssep + __axis_to_str(subdata[i], axis+1);
				};
				txt += sclose;
			}
			return txt;
		}
		return __axis_to_str(data, 0);
	}
	
	// export functions
	return {
		DtypeSimple: DtypeSimple,
		DtypeRecord: DtypeRecord,
		createDtypeFromJson: createDtypeFromJson,
		createViewFromBuffer: createViewFromBuffer,
		createNestedArray: createNestedArray,
		nestedArrayToString: nestedArrayToString,
	};
})();