const electron = require('electron')
const path = require('path')
const fs = require('fs')
const remote = require('electron').remote
const Mustache = require('Mustache')
const { ExifTool } = require("exiftool-vendored");
const exiftool = new ExifTool();
const Chart = require('chart.js');
const Choices = require('Choices.js')
const async = require("async");

var _data = [];
var _currentProj;
var paths_global;
var database = electron.remote.getGlobal('sharedObj').db;
var _updated_notes = {};

$("#add-image").submit(function(e) {
	e.preventDefault();
	if (!paths_global) {
		alert('Please select images');
	}

	async.forEachOfSeries(paths_global, function(item, index, done) {
		var filename = path.basename(paths_global[index]).split(".")[0];
		database.add_image(nospaces(filename), paths_global[index], _currentProj, alert_image_upload);
		done();
	}, function(err) {
		if (err) {
			console.error(err);
		}
		loadDetail(_currentProj);
		paths_global = null;
	});
});

function loadDetail(projectName, filter_params = {}) {
	_currentProj = projectName;

	clearDetailsHtml();

	$('#slidebutton').removeClass('hidden');
	document.getElementById('slidetogglebtn').onclick = toggleSlideView
	document.getElementById('checkLink').onclick = checkAll
	document.getElementById('uncheckLink').onclick = uncheckAll

	document.getElementById('addfilter').onclick = addFilterRow
	document.getElementById('removefilter').onclick = removeFilterRow
	document.getElementById('submitfilter').onclick = performFilter

	redirect('detail');

	/* Display project header. */
	database.get_project(projectName, function(row) {
		loadHeader(row);
		document.getElementById('toggledetail').onclick = function() {
			toggleDetail();
		}
		if ($('#image-wrapper').hasClass('hidden')) {
			$('#toggledetail').html('View Images')
		}

	});

	/* Display images in this project. */
	database.get_images_in_project(
		projectName,
		function(projectName, image_list) {
			image_list.sort(compareTimestamp);

			database.get_database().serialize(function() {
				var count = 0;
				async.forEachOfSeries(image_list, function(image, index, done) {
					var img_path = image['path'];
					var name = image['img_name'];
					database.get_image_metadata(img_path, name, projectName, function(bool, name, path, projectName, metadata) {
						detailExifDisplay__NEW(img_path, name, projectName, metadata, done);
					});
				}, function(err) {
					// returns null error, nothing to do
				});
			});
		},
		filter_params
	);

	loadCharts(projectName, filter_params);
}

/*
** Need to look into resource conservation here, by creating a new exiftool
** only when needed, then calling .end() after it is done batch processing
** (it does also have a batch mode)
*/
function detailExifDisplay__NEW(imgpath, imgname, projname, metadata, callback) {
	var data = {
		'name': imgname,
		'path': imgpath,
		'exifData': {},
		'gpsData': {},
		'fileData': {},
		'favData': {},
		'error': ""
	};
	var template = [
		'<div id="detail-template{{name}}" class="row detail_template no-side-margins">',
		'</div>',
		'<hr id="hr{{name}}" class="detail_template">'
	].join("\n")
	var filler = Mustache.render(template, {name: imgname});
	$("#image-wrapper").append(filler);
	if (Object.keys(metadata).length > 0) {
		data.exifData = metadata;
		insertDetailTemplate(imgname, imgpath, projname);
		callback();
		return;
	}
	exiftool
		.read(imgpath)
		.then(function(tags) {
			delete tags["errors"];
			async.forEachOfSeries(tags, function(item, key, done) {
				if (tags[key]) {
					database.add_image_meta(imgname, imgpath, projname, key, tags[key], detail_exif_display_callback);
				}
				done();
			}, function(err) {
				if (err) {
					console.error(err);
				}
				callback();
			});
			insert_detail_template_callback(true, imgname, imgpath, projname, tags);
		})
		.catch(function(error) {
			console.error(error);
			data.error = error;
			insertDetailTemplate__NEW(data, imgname, imgpath, projname);
		});
}

function insert_detail_template_callback(bool, img_name, img_path, proj_name, metadata_row) {
	if (bool) {
		var data = {
			'name': img_name,
			'path': img_path,
			'exifData': {},
			'gpsData': {},
			'favData': {},
			'fileData': {},
			'error': ""
		};
		for (var key in metadata_row) {
			data.exifData[key] = metadata_row[key];
		}
		database.get_favorite_fields(function(favorites, csv) {
			data = processData(data, favorites);
			insertDetailTemplate__NEW(data, img_name, img_path, proj_name);
		});
	} else {
		insertErrorTemplate(metadata_row, img_name);
		return;
	}
}

function alert_image_upload(bool, project_name, img_path, index, num_images) {
	if (!bool) {
		alert("Unable to add image");
		return
	}
}

function delete_project_callback(bool) {
	if (bool) {
		redirect('projects');
	} else {
		alert("Unable to delete project");
	}
}

function detail_exif_display_callback(bool, imgname, img_path, proj_name, meta_key, meta_value) {
	if (!bool) {
		alert("Failed to add image metadata");
	}
}

function toggleDetail() {
	$('#detail-charts').toggleClass('hidden')
	$('#image-wrapper').toggleClass('hidden')
	var btn = $('#toggledetail')
	if (btn.html().toString().toLowerCase().includes('trends')) {
		btn.html("View Images")
	} else {
		btn.html("View Trends")
	}
	$('#refreshCharts').toggleClass('hidden')
}

function processData(data, favorites) {
	data.ref = [];
	var file = [
		"SourceFile",
		"Directory",
		"FileType",
		"FileTypeExtension",
		"FileModifyDate",
		"FileAccessDate",
		"FilePermissions",
		"FileInodeChangeDate",
		"MIMEType",
		"FileName",
		"ExifToolVersion",
		"FileSize",
		"ExifByteOrder",
		'errors'
	];
	for (var key in data.exifData) {
		var val = data.exifData[key];
		if (String(val).includes('tzoffsetMinutes')) {
			val = displayDate(JSON.parse(val))
			data.exifData[key] = val
		}
		data.ref.push({
		  value: '',
		  label: key + ": " + val,
		  selected: false,
		  disabled: false,
		})
		if (key == "errors" && !isStr(data.exifData[key])) {
			delete data.exifData[key];
		}
		if (favorites.includes(key)) {
			data.favData[key] = data.exifData[key];
			delete data.exifData[key];
		} else if (file.includes(key)) {
			data.fileData[key] = data.exifData[key];
			delete data.exifData[key];
		} else if (key.toLowerCase().includes("gps")) {
			data.gpsData[key] = data.exifData[key];
			delete data.exifData['key'];
		}
	}
	return data;
}

/* Comparator that puts newer images before older ones. */
function compareTimestamp(image1, image2){
	if (image1['last_modified'] > image2['last_modified'])
		return -1;
	else if (image1['last_modified'] == image2['last_modified'])
		return 0;
	else
		return 1;
}

function tripleToDegree(dms) {
	if (typeof dms[Symbol.iterator] === 'function') {
		return dms[0] + dms[1]/60 + dms[2]/3600;
	}
	return dms;
}

function isStr(maybeString) {
	return maybeString && !(maybeString == "");
}

function getType(info) {
	info = info.toLowerCase()
	if (info.includes('.pdf')) {
		return 'pdf'
	} else if (
		info.includes('.jpg') ||
		info.includes('.jpeg') ||
		info.includes('.png') ||
		info.includes('.svg') ||
		info.includes('.gif') ||
		info.includes('.apng') ||
		info.includes('.bmp')
	) {
		return 'img'
	} else if (
		info.includes('.mp4') ||
		info.includes('.mov') ||
		info.includes('.mpeg') ||
		info.includes('.mpg') ||
		info.includes('.avi') ||
		info.includes('.wmv') ||
		info.includes('.ogg') ||
		info.includes('.webm')
	) {
		return 'video'
	} else {
		return 'img'
	}
}

function populate_tags_view(image_name, project_name, image_path, tags) {
	/* Set tagging actions and populate existing tags. */
	var tagsElem = $('#tags' + image_name)[0]
	if (!tagsElem) {
		return;
	}
	var choices = new Choices(tagsElem, {
		items: tags,
		removeItemButton: true,
		editItems: true,
		duplicateItems: false,
		placeholderValue: "Add a tag",
	});

	/* Add tag to database. */
	$('#tags' + image_name)[0].addEventListener('addItem', function(event) {
		database.add_tag(project_name, image_path, event.detail.value);
	});

	/* Remove tag from database. */
	$('#tags' + image_name)[0].addEventListener('removeItem', function(event) {
		database.remove_tag(project_name, image_path, event.detail.value);
	});
}

function populate_notes_view(image_name, project_name, image_path, notes) {
	/* Fill existing notes. */
	$("#notes" + image_name).val(notes);

	/* Store updates to notes in the database. */
	$("#notes" + image_name).change(function(event) {
		database.update_notes(image_path, project_name, $("#notes" + image_name).val());
	});
}

function loadMap(name, lat, long, latref, longref) {
	lat = tripleToDegree(lat);
	long = tripleToDegree(long);
	if (latref.toLowerCase().includes('s') && lat > 0) {
		lat = -1 * lat;
	}
	if (longref.toLowerCase().includes('w') && long > 0) {
		long = -1 * long;
	}
	_map = new google.maps.Map(document.getElementById('map' + name), {
	  zoom: 15,
	  center: {'lat': lat, 'lng': long},
	});
	var marker = new google.maps.Marker({
	    position: {'lat': lat, 'lng': long},
	    map: _map,
	  });
	var div = document.getElementById('map' + name);
	var width = div.offsetWidth
	div.style.height = '500px';
	if (width > 0) {
		div.style.height = width.toString() + 'px';
	}
}

function insertErrorTemplate(error, id) {
	if (error && error.toString().includes('no such file')) {
		error = 'This file could not be found. Is it possible ' +
			'that it was moved? If so, either put it back, or delete ' +
			'this entry and re-add it in its new location.'
	}
	var template = [
		'<div class="col-md-4">',
			'<a href="#">',
				'<img class="img-responsive rounded" src="{{path}}" alt="">',
			'</a>',
		'</div>',
		'<div class="col-md-8">',
			'<div class="row">',
				'<div class="col-md-9">',
					'<h3 style="word-wrap:break-word;" style="display: inline;">{{displayName}}</h3>',
				'</div>',
				'<div class="col-md-3">',
					'<div style="display: inline;" class="dropdown">',
						'<button class="btn btn-outline-secondary float-right dropdown-toggle" type="button" id="dropdown' + id + '" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">',
							'Options',
						'</button>',
						'<div class="dropdown-menu" aria-labelledby="dropdown' + id + '">',
							'<li id="remove{{name}}" class="dropdown-item" href="#">Remove</li>',
							// '<li class="dropdown-item" href="#">Rename</li>',
							// '<li class="dropdown-item" href="#">Star</li>',
						'</div>',
					'</div>',
				'</div>',
			'</div>',
			'<div id="imagedata' + id +' ">',
				'<br>',
				'<div class="alert alert-warning">',
					'<strong>Sorry! </strong>' + error,
				'</div>',
			'</div>',
		'</div>',
	].join("\n");

	var filler = Mustache.render(template, data);
	document.getElementById("detail-template" + data.name).innerHTML += filler;

	setPhotoRemove(data.name);
	// setPhotoRename(data.name);
}

function loadHeader(project) {
  	template = [
		"<div class='col-md-6 col-xs-8'>",
	    	"<h1 id='name-header' class='my-4 name-header'>{{displayName}}</h1>",
			"<h4 class='desc-header'>{{projDesc}}</h4>",
			"<div class='btn btn-primary btn-md' style='margin-left: 10px;' id='toggledetail'>",
				"View Trends",
			"</div>",
			"<div class='btn hidden btn-default btn-md' style='margin-left: 10px;' id='refreshCharts'>",
				"Refresh Charts",
			"</div>",
		"</div>",
		"<div class='col-md-2 col-xs-4 float-right'>",
			"<button type='' class='btn btn-primary float-right mb-2 command-buttons' data-toggle='tooltip' data-placement='left' title='Download as CSV' style='margin-top:50px; border-color: #0d77e2; background-color: #0d77e2; color=white' id='export{{projName}}'>",
				"<i class='material-icons'>file_download</i>",
			"</button>",
			'<br>',
			"<button type='' id='upload{{projName}}' class='btn btn-primary float-right mb-2 command-buttons' data-toggle='tooltip' data-placement='left' title='Add New File' style='border-color: #0d77e2; background-color: #0d77e2; color: white'>",
				"<i class='material-icons'>add</i>",
			"</button>",
			"<br>",
			"<button type='' class='btn btn-danger float-right mb-2 command-buttons' data-toggle='tooltip' data-placement='left' title='Delete Project' style='border-color:#ff0099; background-color: #ff0099; color=white;' id='delete{{projName}}'>",
				"<i class='material-icons'>delete</i>",
			"</button>",
			"<br>",
		"</div>",
		"<div id='project-name' hidden=true>{{projName}}</div>",
    ].join("\n");
    data = {
      	projName: project['name'],
	  	displayName: project['name'].replace(/__/g, " "),
      	projDesc: project['description'],
    }
    var filler = Mustache.render(template, data);
    $("#detail-header").append(filler);

	document.getElementById("export" + project['name']).onclick = function() {
		electron.remote.dialog.showSaveDialog(function(filename, bookmark) {
			database.get_images_in_project(project['name'], function(projName, rows) {
				database.get_favorite_fields(function(_, columns_dup) {
					/* Create CSV Header. */
					var csvString = "";
					var columns = columns_dup.filter(function(item, pos) {
    				return columns_dup.indexOf(item) == pos;
					})
					columns.forEach(function(col) {
						csvString += col + ", ";
					});
					csvString += "\n";

					rows.forEach(function(row) {
						columns.forEach(function(col) {
							var value = row[col];
							if (typeof value != "string") {
								value = JSON.stringify(value);
							}
							value = value.split(',').join(" ");
							csvString += value + ", ";
						});
						csvString += "\n";
					});
					fs.writeFileSync(filename+".csv", csvString);
				});
			});
		});
	};

	document.getElementById("delete" + project['name']).onclick = function() {
		var ans = confirm("Are you sure you want to delete this project?");
		if (ans) {
			database.delete_project(project['name'], delete_project_callback);
		}
	};

	document.getElementById("upload" + project['name']).onclick = function() {
		let paths = electron.remote.dialog.showOpenDialog({properties: ['openFile', 'multiSelections']});
		async.forEachOfSeries(paths, function(item, index, done) {
			var filename = path.basename(paths[index]).split(".")[0];
			filename = nospaces(filename)
			database.add_image(filename, paths[index], project['name'], index, paths.length, alert_image_upload);
			done();
		}, function(err) {
			if (err) {
				console.error(err);
			}
			loadDetail(project['name'])
		});
	};

	document.getElementById('refreshCharts').onclick = function() {
		refreshCharts(project['name'])
	}
}

function insertDetailTemplate(img_name, img_path, proj_name) {
	database.get_image_metadata(img_path, img_name, proj_name, insert_detail_template_callback);
}

function insertDetailTemplate__NEW(data, id, path, projname) {
	data.displayName = withspaces(data.name)
	data.id = id;

	if (data.error) {
		insertErrorTemplate(data, id);
		return;
	}
	var contents = {};
	var disableds = {};
	var types = ['exif', 'gps', 'file', 'fav'];
	for (var ind in types) {
		var name = types[ind];
		var category = data[name + 'Data'];
		var content = '';
		content += '<div class="table-responsive table-condensed">'
		content += '<table class="table">'
		content += '<tbody>'
		var hasData = false
		for (var key in category) {
			var hasData = true;
			content += '<tr>';
			content += '<td style="padding:1.0rem"><strong>' + key + '</strong>: ' + category[key] + '</td>';
			content += '</tr>'
		}
		if (!hasData) {
			disableds[name] = 'disabled';
		} else {
			disableds[name] = '';
		}
		if (content.includes('<tr>') && !content.endsWith('</tr>')) {
			content += '</tr>';
		}
		content += '</tbody></table></div>'
		hasData = false
		contents[name] = content
	}

	var flag_string = 'Flagged as modified';
	var is_modified = false
	if (contents['exif'].toLowerCase().includes('adobe')) {
		flag_string = 'File modified by Adobe software.'
		is_modified = true

	}
	var flag_trigger = 'hidden';
	if (is_modified) {
		flag_trigger = '';
	}
	data.flag = flag_trigger
	data.flag_str = flag_string

	data.media = getType(data.fileData.SourceFile)
	data.sorry = "Sorry, we are not able to display this file. Consider inspecting it on your computer at {{path}}. However, there may still be exif data displayed to the right."
	var mediacontents
	if (data.media != 'pdf') {
		mediacontents = '<{{media}} class="img-responsive rounded" src="{{path}}" alt="' + data.sorry + '" controls>'
		data.thumbcontents = '<{{media}} class="img-responsive rounded thumb" src="{{path}}" alt="{{displayName}}" controls>'
	} else {
		var path_nospace = data.path.replace(/ /g, '%20')
		mediacontents = '<webview src="{{path}}" plugins></webview>'
		data.thumbcontents = '<webview src="{{path}}" class="thumb" plugins></webview>'
	}

	insertIntoSlideMenu(data, id);


	var template = [
		'<div class="col-md-4 col-xs-6">',
			'<div class="row name-row">',
				'<h3 class="image-name">{{displayName}}</h3>',
				'<div class="dropdown" style="display:inline; float:right">',
					'<button class="settings-button btn btn-outline-secondary float-right dropdown-toggle" style="background-color: #89cafd; margin-bottom: 2px; color: white" type="button" id="dropdown' + id + '" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">',
						'<i class="material-icons icon" style="height:25px;width:15px;font-size:15px;">settings</i>',
					'</button>',
					'<ul class="dropdown-menu" aria-labelledby="dropdown' + id + '">',
						'<li id="remove{{name}}" class="dropdown-item"><a href="#">Remove</a></li>',
					'</ul>',
				'</div>',
				'<i class="material-icons {{flag}}" style="color: #f8e408; height:25px; display:inline; float:right;" data-toggle="tooltip" data-placement="auto" title="{{flag_str}}">error</i/>',
			'</div>',
			mediacontents,
		'</div>',
		'<div class="col-md-8 col-xs-6">',
			'<div class="row">',
				'<div class="col-md-7 col-xs-12">',
					// tags
					'<input type="text" class="choices-tags form-control choices__input is-hidden" id="tags{{name}}" multiple>',
					// accordian for exif display
					'<div id="exif-accordian{{id}}" role="tablist" aria-multiselectable="true">',
						'<div class="panel panel-default data-panel">',
						  	'<div class="panel-heading accordian-header">',
								'<div class="" role="tab" id="trigger-fav{{id}}" style="display:inline">',
									'<a class="collapsed accordian-link" data-toggle="collapse" data-parent="#exif-accordian{{id}}" href="#display-fav{{id}}" aria-expanded="false" aria-controls="display-fav{{id}}">',
										'Favorite',
									'</a>',
								'</div>',
							  	'<div class="" role="tab" id="trigger-file{{id}}" style="display:inline">',
									'<a class="collapsed accordian-link" data-toggle="collapse" data-parent="#exif-accordian{{id}}" href="#display-file{{id}}" aria-expanded="false" aria-controls="display-file{{id}}">',
										'File',
									'</a>',
								'</div>',
							  	'<div class="" role="tab" id="trigger-exif{{id}}" style="display:inline">',
									'<a class="collapsed accordian-link" data-toggle="collapse" data-parent="#exif-accordian{{id}}" href="#display-exif{{id}}" aria-expanded="true" aria-controls="display-exif{{id}}">',
										'Exif',
									'</a>',
								'</div>',
							    '<div class="" role="tab" id="trigger-gps{{id}}" style="display:inline">',
									'<a class="collapsed accordian-link" data-toggle="collapse" data-parent="#exif-accordian{{id}}" href="#display-gps{{id}}" aria-expanded="true" aria-controls="display-gps{{id}}">',
										'GPS',
									'</a>',
								'</div>',
						  	'</div>',
							'<div id="display-fav{{id}}" class="panel-collapse collapse accordian-body" role="tabpanel" aria-labelledby="trigger-fav{{id}}">',
								'<div class="panel-body">',
									contents.fav,
								'</div>',
							'</div>',
						  	'<div id="display-file{{id}}" class="panel-collapse collapse accordian-body" role="tabpanel" aria-labelledby="trigger-file{{id}}">',
								'<div class="panel-body">',
									contents.file,
								'</div>',
							'</div>',
						  	'<div id="display-exif{{id}}" class="panel-collapse collapse accordian-body" role="tabpanel" aria-labelledby="trigger-exif{{id}}">',
								'<div class="panel-body">',
									contents.exif,
								'</div>',
							'</div>',
						  	'<div id="display-gps{{id}}" class="panel-collapse collapse accordian-body" role="tabpanel" aria-labelledby="trigger-gps{{id}}">',
								'<div class="panel-body">',
									contents.gps,
								'</div>',
							'</div>',
						'</div>',
					'</div>',
					//accordian ends
				'</div>',
				'<div class="col-md-5 col-xs-12">',
					// notes
					'<textarea class="form-control notes" rows="3" placeholder="Notes" id="notes{{name}}"/>',
					// search bar
					'<select class="form-control choices__input is-hidden" id="search{{name}}" multiple></select>',
				'</div>',
			'</div>',
		'</div>',
	].join("\n");

	var filler = Mustache.render(template, data);
	data.name = data.name.replace(/ /g, "\\ ");
	$("#detail-template" + data.name).append(filler);

	$('[data-toggle="tooltip"]').tooltip();

	setPhotoRemove(data.name);

	var searchElem = $('#search' + data.name)[0]
	if (!searchElem) {
		return;
	} else {
		var choices = new Choices(searchElem, {
			choices: data.ref,
			paste: false,
			duplicateItems: false,
			placeholder: "Enter/select a tag",
			itemSelectText: '',
			duplicateItems: true,
			placeholderValue: "Search Exif data",
		});
	}

	/* Handle notes. */
	database.get_notes(id, path, projname, populate_notes_view);

	/* Handle tags. */
	database.get_tags(id, path, projname, populate_tags_view);
}

function loadCharts(proj_name, filter_params) {
	var msg = 'Check to convert all times to GMT (for comparison across timezones). Otherwise, times will be left in local capture times, so cross-timezone chronology may be lost'
	template = [
		'<div class="charts" id="chart-wrapper" style="padding-top:30px">',
			'<div class="row no-side-margins">',
				'<div class="col-sm-6 col-xs-12" style="padding-right: 15px">',
					'<div class="panel panel-default">',
						'<div class="panel-heading"> Creation Date',
							'<div style="float:right">',
								'<a href="#" class="custom-tooltip" data-toggle="tooltip" data-placement="auto" title="' + msg + '">GMT: </a>',
								'<input class="form-check-input" type="checkbox" id="gmt-detail">',
								'Granularity:',
								'<select id="granularity-detail">',
									'<option>Year</option>',
									'<option>Month</option>',
									'<option selected>Day</option>',
									'<option>Hour</option>',
									'<option>Minute</option>',
									'<option>Second</option>',
								'</select>',
							'</div>',
						'</div>',
						'<div id="detail-line-holder" class="panel-body">',
							'<div class="flot-chart">',
								'<canvas id="lineChart"></canvas>',
							'</div>',
						'</div>',
					'</div>',
				'</div>',
				'<div class="col-sm-6 col-xs-12">',
					'<div class="panel panel-default">',
						'<div class="panel-heading"> Image Locations </div>',
						'<div class="panel-body" style="text-align: center;">',
							'<div style="width:95%; height: 21vw;" id="trendsmap"></div>',
						'</div>',
					'</div>',
				'</div>',
			'</div>',
			'<div class="row no-side-margins">',
				'<div class="col-sm-6 col-xs-12">',
					'<div class="panel panel-default">',
					   '<div class="panel-heading">',
						 '<select class="form-control" data-trigger data-section="chart-3" name="choices-single" id="field-select-3"></select>',
						 '</div>',
					 	'<div class="panel-body">',
				 			'<div class="flot-chart">',
					   			'<canvas id="chart-3"></canvas>',
					  		'</div>',
					 	'</div>',
				 	'</div>',
			 	'</div>',
				'<div class=" col-sm-6 col-xs-12">',
					'<div class="panel panel-default">',
					   	'<div class="panel-heading">',
							'<select class="form-control" data-trigger data-section="chart-4" name="choices-single" id="field-select-4"></select>',
							'</div>',
					 	'<div class="panel-body">',
					 		'<div class="flot-chart">',
					   			'<canvas id="chart-4"></canvas>',
					 		'</div>',
						'</div>',
				 	'</div>',
			 	'</div>',
		 	'</div>',
		'</div>',
	].join("\n");

	$("#detail-charts").append(template);

	create_data_charts();

	document.getElementById('granularity-detail').addEventListener('change', function(event) {
		document.getElementById('detail-line-holder').innerHTML = '<div class="flot-chart"><canvas id="lineChart"></canvas></div>'
		renderLineChart(proj_name, filter_params)
	})

	document.getElementById('gmt-detail').addEventListener('click', function(event) {
		document.getElementById('detail-line-holder').innerHTML = '<div class="flot-chart"><canvas id="lineChart"></canvas></div>'
		renderLineChart(proj_name, filter_params)
	})

	renderLineChart(proj_name, filter_params)



	database.get_camera_models(proj_name, function(models, counts) {
		/* Set content to "no data exists" image if needed. */
		if (models.length == 0) {

		} else {
			addPieChart(
				"chart-3",
				models,
				counts,
				"Model"
			);
		}
	},
	filter_params,
	);

	database.get_locations_for_images(proj_name, function(locations) {
		/* Set content to "no data exists" image if needed. */
		addMap(
			"trendsmap",
			locations
		);
	},
	filter_params,
	);

	database.get_apertures(proj_name, function(apertures, counts) {
		/* Set content to "no data exists" image if needed. */
		if (apertures.length == 0) {

		} else {
			addPieChart(
				"chart-4",
				apertures,
				counts,
				"Aperture"
			);
		}
	},
	filter_params,
	);
}

function insertIntoSlideMenu(data, id) {
	// name view
	var name_row = [
		'<div class="row thumb-row">',
			'<label class="menu-check">',
				'<input id="{{name}}check" class="name-checkbox" type="checkbox" checked>',
				'{{displayName}}',
			'</label>',
		'</div>',
	].join('\n')
	var row = Mustache.render(name_row, data);
	$('#name-menu').append(row);

	if (data.name) {
		var elem = document.getElementById(data.name.toString() + 'check')
		if (elem) {
			elem.onclick = function() {
				$('#detail-template' + data.name).toggleClass('hidden')
				$('#hr' + data.name).toggleClass('hidden');
				var other = document.getElementById(data.name.toString() + 'check_thumb')
				other.checked = !other.checked
			};
		}
	}

	//thumbnail view
	var thumb_row = [
		'<div class="row thumb-row">',
			'<input id="{{name}}check_thumb" type="checkbox" checked class="menu-check-thumb">',
			'<div class="panel panel-defualt data-panel clearfix thumb-panel">',
				data.thumbcontents,
			'</div>',
		'</div>',
	].join('\n')
	row = Mustache.render(thumb_row, data)
	$('#thumb-menu').append(row)

	if (data.name) {
		elem = document.getElementById(data.name.toString() + 'check_thumb')
		if (elem) {
			elem.onclick = function() {
				$('#detail-template' + data.name).toggleClass('hidden')
				$('#hr' + data.name).toggleClass('hidden');
				var other = document.getElementById(data.name.toString() + 'check')
				other.checked = !other.checked
			};
		}
	}
}

function toggleSlideView() {
	$('#name-menu').toggleClass('hidden')
	$('#thumb-menu').toggleClass('hidden')
}

function checkAll() {
	var boxes = document.getElementsByClassName('menu-check-thumb')
	for (var ind in boxes) {
		var input = boxes[ind]
		input.checked = true
	}
	boxes = document.getElementsByClassName('name-checkbox')
	for (var ind in boxes) {
		var input = boxes[ind]
		input.checked = true
	}
	var templates = document.getElementsByClassName('detail_template')
	for (var ind in templates) {
		var template = templates[ind]
		if (template.classList) {
			template.classList.remove('hidden')
		}
	}
}

function uncheckAll() {
	var boxes = document.getElementsByClassName('menu-check-thumb')
	for (var ind in boxes) {
		var input = boxes[ind]
		input.checked = false
	}
	boxes = document.getElementsByClassName('name-checkbox')
	for (var ind in boxes) {
		var input = boxes[ind]
		input.checked = false
	}
	var templates = document.getElementsByClassName('detail_template')
	for (var ind in templates) {
		var template = templates[ind]
		if (template.classList) {
			template.classList.add('hidden')
		}
	}
}

function setPhotoRemove(name) {
	var projName = document.getElementById('project-name').innerHTML;
	var elem = document.getElementById("remove" + name)
	if (!elem) {
		return;
	}
	elem.onclick = function() {
		database.get_projects(function(bool){});
		database.delete_image(name, projName, function(bool) {
			var content = document.getElementById('detail-template' + name);
			content.parentNode.removeChild(content);
			var line = document.getElementById('hr' + name);
			line.parentNode.removeChild(line);
			for (var row = 0; row < _data.length; row++) {
				if (_data[row]['Image Name'] == name) {
					_data.splice(row, 1);
					break;
				}
			}
		});
	};
}

// TODO: a project for the future
// function setPhotoRename(name) {
// 	var projName = document.getElementById('project-name').innerHTML;
// 	document.getElementById("rename" + name).onclick = function() {
// 		var projectPath = storage.getProject(projName);
// 		console.log(projectPath);
// 		console.log(projName);
// 		var proj = loadProject(path.join(projectPath, projName + '.json'));
// 		var image = proj.loadImage(name);
// 		if (!image) {
// 			console.log('image not found');
// 			return;
// 		}
// 		var oldName = name;
// 		var input = document.getElementById("input-new" + name);
// 		input.style.display = "none";
// 		//var newName = document.get
// 		//image.rename()
// 	}
// }

function clearDetailsHtml() {
	// clear previous projects on the html
	_data = [];
	document.getElementById("detail-header").innerHTML = ""
	document.getElementById("image-wrapper").innerHTML = ""
	document.getElementById("detail-charts").innerHTML = ""
	document.getElementById("name-menu").innerHTML = ""
	document.getElementById("thumb-menu").innerHTML = ""
}

function refreshCharts(projName) {
	document.getElementById("detail-charts").innerHTML = ""
	loadCharts(projName, {})
}

module.exports = {
	loadDetail: loadDetail
};
