const electron = require('electron');
const exif_mov = require('exiftool');
const fs = require('fs');
const exif_jpg = require('exif-js');

class Image {

  //should take in a path/src, name, and project
  constructor(name, path, project) {
      this._name = name;
      this._path = path;
      this._project = project.getProjectName();
      this._metadata = null;

      // var helper = path.format(this._path).split(".");
      // if (helper[helper.length - 1] == "jpg" || helper[helper.length - 1] == "jpeg" || helper[helper.length - 1] == "JPG" || helper[helper.length - 1] == "JPEG") {
      //   this._metadata = getJpgMetdata(path);
      // } else if (helper && helper[helper.length - 1] == "mov") {
      //   this._metadata = getMovMetadata(path)
      // } else {
      //   this._metadata = getJpgMetdata(path);
      // }

      // Set image directory.
      this._imageDirectory = path.join(project.getProjectDirectory(), 'images');
  }

  //set path
  setPath(path) {
    this._path = path;
  }

  //get path
  getPath() {
    return this._path;
  }

  //set name
  setName(name) {
    this._name = name;
  }

  //get name
  getName() {
    return this._name;
  }

  //set project
  setProject(project) {
    this._project = project;
  }

  //get project
  getProject() {
    return this._project;
  }

  setMetadata(metadata) {
    this._metadata = metadata;
  }

  getMetadata() {
    return this._metadata;
  }

  getMovMetadata(path) {
  //need to figure out if we need the entire path here
    var image = fs.readFileSync(path);
  }

  //need to figure out if we need the entire path here.
  getJpgMetdata(path) {
    return exif_jpg.getData(path, function() {
      var allMetaData = exif_jpg.getAllTags(this);
      return allMetaData;
    });
  }

  // Save image.
  saveImage() {
    if (!fs.existsSync(this._imageDirectory)) {
      fs.mkdir(this._imageDirectory);
    }

    var filePath = path.join(this._imageDirectory, this._name + '.json');
    fs.writeFileSync(filePath, JSON.stringify(this.toDict()));
  }

  toDict() {
    var imageDict = new Object();
    imageDict['name'] = this._name;
    imageDict['path'] = path.format(this._path);
    imageDict['project'] = this._project;
    imageDict['metadata'] = this._metadata;
    imageDict['imageDirectory'] = this._imageDirectory;
    return imageDict;
  }

  // Returns the path of this image file.
  getImagePath() {
    return path.join(this._imageDirectory, this._name + '.json');
  }

}
exports.Image = Image;
