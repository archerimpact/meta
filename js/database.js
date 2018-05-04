const os = require('os')
const path = require('path')
const electron = require('electron')
const sqlite3 = require('sqlite3')
// Get the user data path, the directory in which the information will be stored.
const userDataPath = (electron.app || electron.remote.app).getPath('userData');
const db_filename = path.join(userDataPath, 'meta.db');

class Database {
  constructor(opts) {
    this.db = this.init_database();
    this.last_image_id = 0;
    console.log(db_filename);
  }

  /* Uses callback(boolean) to return if Projects contains name. */
  has_project(name, callback) {
    var bool = true;
    var stmt = this.db.prepare("SELECT * FROM Projects WHERE name = ?");
    stmt.get([name], function(err, row) {
      if (err) {
        throw error;
      }
      console.log()
      if (row == undefined) {
        bool = false;
        console.log('has_project: project', name, 'is NOT in Projects');
      } else {
        console.log('has_project: project', name, 'is in Projects');
      }
      callback(bool);
    });
    stmt.finalize();

    // /* Pass creation status, project name, and list of images to add to callback. */
    // callback(bool, name, image_paths);
  }

  /* Uses callback(boolean) to return whether or not proj_name has img_path. */
  has_image(img_path, proj_name, callback) {
    // return whether image with given path already exists for a given project
    var _this = this;
    var db = this.db;
    this.has_project(proj_name, function(bool) {
      if (!bool) {
        console.log("has_image: Project not found", proj_name);
        callback(false);
      } else {
        var stmt = db.prepare("SELECT * FROM Images WHERE path = ? AND proj_name = ?");
        stmt.get([img_path, proj_name], function(err, row) {
          var bool = true;
          if (err) {
            throw error;
          }
          if (row == undefined) {
            bool = false;
            console.log('has_image: image', img_path, 'is NOT in Images');
          } else {
            console.log('has_image: image', img_path, 'is in Images');
          }
          callback(bool);
        });
        stmt.finalize();
      }
    });

  }

  has_metadata(img_path, proj_name, callback) {

  }

  /* Use callback(boolean) to return if project was successfully created. */
  add_project(name, description, img_paths, callback) {
    var _this = this;
    var db = this.db;
    var success = false;
    db.serialize(function() {
      _this.has_project(name, function(bool) {
        if (!bool) {
          var stmt = db.prepare("INSERT INTO Projects (name, description, creation, last_modified) VALUES (?, ?, ?, ?)");
          var created = Date.now();
          stmt.run(name, description, created, created);
          stmt.finalize();
          success = true;
          console.log('add_project: project', name, description, 'was created successfully');
        } else {
          console.log('add_project: project', name, description, 'could not be created');
        }
        callback(success, name, img_paths);
      });
    });
  }

  /* Uses callback(boolean) to return if image was added successfully or not. */
  add_image(img_name, img_path, proj_name, callback) {
    // Check if image has been made yet, if not create it
    var _this = this;
    var db = this.db;
    var success = false;
    console.log("adding image");
    db.serialize(function() {
      _this.has_image(img_path, proj_name, function(bool) {
        if (bool) {
          console.log('add_image:', img_name, 'already in', proj_name);
        } else {
          var stmt = db.prepare("INSERT INTO Images (img_name, path, proj_name, " +
                                "creation, last_modified, tags, starred, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
          var created = Date.now();
          stmt.run(img_name, img_path, proj_name, created, created, "", "", "");
          stmt.finalize();
          console.log('add_image: successfully added image', img_name, img_path, proj_name)
          success = true;
        }
        callback(success, proj_name, img_path);
      });
    });
  }

  // TODO: handle spaces in metafields(?)
  add_image_meta(img_path, proj_name, meta_key, meta_value, callback) {
    // set metadata for image
    // if column doesn't exist, add column
    var _this = this;
    var db = this.db;
    db.serialize(function() {
      var columns = [];
      db.each("PRAGMA table_info(Images)", function(err, col) {
        if (err) {
          throw error;
        }
        columns.push(col.name);
      }, function() {
        console.log('add_project: columns', columns);
        var col_exists = (columns.indexOf(meta_key) >= 0);

        if (!col_exists) {
          var meta_type = typeof meta_value;
          db.run("ALTER TABLE Images ADD " + meta_key + " " + meta_type + ";");
          console.log('add_project: col added', meta_key, meta_type);
        }

        var success = false;
        _this.has_image(img_path, proj_name, function(bool) {
          if (bool) {
            var query = "UPDATE Images SET " + meta_key + "=? WHERE path=? AND proj_name=?"
            var stmt = db.prepare(query);
            stmt.run([meta_value, img_path, proj_name]);
            stmt.finalize();
            success = true;
            console.log('add_image_meta: image', img_path, 'metadata', meta_key, meta_value)
          } else {
            console.log('add_image_meta: image', img_path, 'does not exist in', proj_name);
          }
          callback(success);
        });
      });
    });
  }

  update_project_name(old_name, new_name, callback) {
    this.has_project(old_name, function(bool) {
      callback(true);
    });
  }

  update_project_description(proj_name, description, callback) {
    // update project description
    var bool = true;
    callback(bool);
  }

  /* Get information for a specific project. */
  get_project(projectName, callback) {
    var _this = this;
    var db = this.db;
    db.serialize(function() {
      var stmt = db.prepare("SELECT * FROM Projects WHERE name=?");
      stmt.get([projectName], function(err, row) {
        if (err) {
          throw error;
        }
        callback(row);
      });
      stmt.finalize();
    });
  }

  /* Use callback(list) to return a list of projects. */
  get_projects(callback) {
    var _this = this;
    var db = this.db;
    db.serialize(function() {
      var projects = [];
      var stmt = db.prepare("SELECT name, description FROM Projects");
      stmt.each(function(err, row) {
        if (err) {
          throw error;
        }
        projects.push(row);
        // is this syntax correct?
      }, function() {
        console.log('get_projects: list of projects', projects);
        callback(projects);
      });
      stmt.finalize();
    });
  }

  // TODO: add support for only showing images that satisfy a certain condition
  /* Uses callback(list) to return a list of images in a project. */
  get_images_in_project(proj_name, callback) {
    // return list of tuples: (img_path, proj_name) — this is the PRIMARY KEY into the Images table
    var _this = this;
    var db = this.db;
    db.serialize(function() {
      _this.has_project(proj_name, function(bool) {
        if (bool) {
          var images = [];
          var stmt = db.prepare("SELECT * FROM Images WHERE proj_name = ?");
          stmt.get([proj_name], function(err, row) {
            if (err) {
              throw error;
            }
            console.log("pushed row to images list: " + row);
            images.push(row);
            console.log('get_images_in_project:', images, 'in', proj_name);
            callback(proj_name, images);
          });
          stmt.finalize();
        } else {
          console.error('get_images_in_project:', proj_name, "does not exist");
          callback(proj_name, []);
        }
      });
    });
  }

  /* Uses callback(list) to return list of metadata fields. */
  get_metadata_fields(callback) {
    var _this = this;
    var db = this.db;
    db.serialize(function() {
      var fields = [];
      var not_metadata = ["img_name", "path", "proj_name", "creation",
                          "last_modified", "tags", "starred", "notes"];
      db.each("PRAGMA table_info(Images)", function(err, col) {
        if (err) {
          throw error;
        }
        var name = col.name;
        if (not_metadata.indexOf(name) < 0) {
          fields.push(name);
        }
      }, function() {
        console.log('get_metadata_fields: fields', fields);
        callback(fields);
      });
    });
  }

  /* Uses callback(dictionary) to return dict of metafields to metadata.
   * Ignores any fields that are not filled in. */
  get_image_metadata(img_path, img_name, proj_name, callback) {
    var _this = this;
    var db = this.db;
    db.serialize(function() {
      _this.has_image(img_path, proj_name, function(bool) {
        if (!bool) {
          console.log("get_selected_image_metadata: Image not found", img_path);
          callback(false, img_name, proj_name, {});
        } else {
          var not_metadata = ["img_name", "path", "proj_name", "creation",
                      "last_modified", "tags", "starred", "notes"];
          var stmt = db.prepare("SELECT * FROM Images WHERE path=? AND proj_name=?");
          stmt.get([img_path, proj_name], function(err, row) {
            for (var key in row) {
              if (row[key] == null || not_metadata.indexOf(key) >= 0) {
                delete row[key];
              }
            }
            console.log('get_image_metadata: row', row);
            callback(true, img_name, proj_name, row);
          });
          stmt.finalize();
        }
      });
    });
  }

  /* Uses callback(dictionary) to return dict of metafields to metadata.
   * Ignores any fields that are not filled in. */
  get_selected_image_metadata(img_path, proj_name, selected, callback) {
    var _this = this;
    var db = this.db;
    db.serialize(function() {
      _this.has_image(img_path, proj_name, function(bool) {
        if (!bool) {
          console.log("get_selected_image_metadata: Image not found", img_path);
          callback({});
        } else {
          var not_metadata = ["img_name", "path", "proj_name", "creation",
                      "last_modified", "tags", "starred", "notes"];
          var stmt = db.prepare("SELECT * FROM Images WHERE path=? AND proj_name=?");
          stmt.get([img_path, proj_name], function(err, row) {
            for (var key in row) {
              if (row[key] == null || not_metadata.indexOf(key) >= 0
                  || selected.indexOf(key) < 0) {
                delete row[key];
              }
            }
            console.log('get_image_metadata: row', row);
            stmt.finalize();
            callback(row);
          });
        }
      });
    });
  }

  init_database() {
    var db = new sqlite3.Database(db_filename, (err) => {
      if (err) {
        console.error(err.message);
      }

      // if meta.db was just created, create Images and Projects tables.
      this.create_tables_if_new_db(db);

      console.log('Connected to the meta database.');
    });

    return db;
  }

  create_tables_if_new_db(db) {
    var image_query = "SELECT name FROM sqlite_master WHERE type='table' AND name='Images'";
    var project_query = "SELECT name FROM sqlite_master WHERE type='table' AND name='Projects'";
    var setting_query = "SELECT name FROM sqlite_master WHERE type='table' AND name='Settings'";

    var db = this.db;

    db.serialize(function() {
      // check if Images table exists, and create if it does not
      db.get(image_query, (err, row) => {
        if (row == undefined) {
          var create_image_table = "CREATE TABLE Images (img_name TEXT, path TEXT, proj_name TEXT, " +
                                   "creation NUMERIC, last_modified NUMERIC, tags TEXT, starred TEXT, " +
                                   "notes TEXT)";
          db.run(create_image_table);
          console.log("Images table created");
        } else {
          console.log("Images table loaded");
        }

        if (err) {
          console.log("Error during Images construction: " + err);
        }
      });

      // check if Projects table exists, and create if it does not
      db.get(project_query, (err, row) => {
        if (row == undefined) {
          var create_project_table = "CREATE TABLE Projects (name TEXT, description TEXT," +
                                     "creation NUMERIC, last_modified NUMERIC)";
          db.run(create_project_table);
          console.log("Projects table created");
        } else {
          console.log("Projects table loaded");
        }

        if (err) {
          console.log("Error during Projects construction: " + err);
        }
      });

      // check if Settings table exists, and create if it does not
      db.get(setting_query, (err, row) => {
        if (row == undefined) {
          var create_setting_table = "CREATE TABLE Settings (type TEXT, setting TEXT)";
          db.run(create_setting_table);
          console.log("Settings table created");
        } else {
          console.log("Settings table loaded");
        }

        if (err) {
          console.log("Error during Settings construction: " + err);
        }
      });
    });
  }

  get_database() {
    return this.db;
  }

  close() {
    this.db.close();
  }

  /* Never use this in code, only use for testing. */
  clear_database(callback) {
    this.db.run("DROP TABLE Projects; DROP TABLE Images; DROP TABLE Settings;");
    callback();
  }
}

module.exports = Database
