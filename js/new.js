const load_detail = require('./js/detail.js').loadDetail
var sqlite3 = require('sqlite3').verbose();

var paths_global = [];
var database = electron.remote.getGlobal('sharedObj').db;

$("#new-project").submit(function(e) {
	e.preventDefault();
	var projectName = createProject();
    if (projectName) {
    	clearNew();
      	load_detail(projectName);
    }
});

function createProject(){
	var name = document.getElementById("name-input").value;
	name = name.replace(/ /g, '__');
	name = name.replace(/'/g, '__');
	name = name.replace(/"/g, '__');
	name = name.replace(/;/g, '__');

	var desc = document.getElementById("desc-input").value;
	// file paths stored in paths_global

	if (!name) {
		alert("Please provide a project name");
		return
	} else if (unacceptableFormat(name)) {
		alert("Please provide a valid project name. Commas, slashes, and periods cannot be used.");
		return
	}

	database.add_project(name, desc, paths_global, populate_project_with_images);

	return name;
}

function alert_image_upload(bool, project_name, img_path, index, num_images) {
	if (!bool) {
		alert("Unable to add image");
		return
	} else if (index == num_images - 1) {
		/* Load project view. */
		load_detail(project_name);
	}
}

function populate_project_with_images(bool, project_name, img_paths) {
	if (!bool) {
		alert("Unable to create project");
		return
	}

	/* Populate newly created project with provided images. */
	for (var index in img_paths) {
		var filename = path.basename(img_paths[index]).split(".")[0];
		database.add_image(nospaces(filename), img_paths[index], project_name, index, img_paths.length, alert_image_upload);
	}
}

function unacceptableFormat(name) {
	return name.includes(".") || name.includes("/") || name.includes(",") ||
		   name.includes("\\") || name.includes(">") || name.includes("<");
}

function clearNew() {
	paths_global = [];
	document.getElementById("name-input").value = "";
	document.getElementById("desc-input").value = "";
	document.getElementById("file-label").innerHTML = "";
}

function setupload() {
	var holder = document.getElementById('upload');
	if (!holder) {
	  	return false;
	}

	holder.ondragover = () => {
	    return false;
	};

	holder.ondragleave = () => {
	    return false;
	};

	holder.ondragend = () => {
	    return false;
	};

	holder.onclick = () => {
	  	let paths = electron.remote.dialog.showOpenDialog({properties: ['openFile', 'multiSelections']});
		if (!paths) {
			return false;
		}
		paths_global = paths;
		var selected_str = " files selected";
		if (paths_global.length == 1) {
			selected_str = " file selected"
		}
		document.getElementById("file-label").innerHTML = String(paths_global.length) + selected_str;
	};

	holder.ondrop = (e) => {
	    e.preventDefault();
		var paths = e.dataTransfer.files;
		if (!paths) {
			return false;
		}
		paths_global = paths;
		var selected_str = " files selected";
		if (paths_global.length == 1) {
			selected_str = " file selected"
		}
		document.getElementById("file-label").innerHTML = String(paths_global.length) + selected_str;
	    return false;
	};
}

setupload();
