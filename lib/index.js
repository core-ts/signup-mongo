"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function useRepository(db, user, authen, conf, c, maxPasswordAge, track, mp) {
  if (c) {
    return new MongoRepository(db, user, authen, conf, maxPasswordAge, c.maxPasswordAge, c.contact, c.username, c.status, c.password, track, mp);
  } else {
    return new MongoRepository(db, user, authen, conf, maxPasswordAge, undefined, undefined, undefined, undefined, undefined, track, mp);
  }
}
exports.useRepository = useRepository;
exports.useService = useRepository;
exports.useSignupService = useRepository;
exports.useSignupRepository = useRepository;
exports.useSignup = useRepository;
exports.useUserRegistrationService = useRepository;
exports.useUserRegistrationRepository = useRepository;
exports.useUserRegistration = useRepository;
var MongoRepository = (function () {
  function MongoRepository(db, user, authen, conf, maxPasswordAge, maxPasswordAgeField, contact, username, status, password, track, mp) {
    this.db = db;
    this.user = user;
    this.authen = authen;
    this.conf = conf;
    this.maxPasswordAge = maxPasswordAge;
    this.maxPasswordAgeField = maxPasswordAgeField;
    this.track = track;
    this.username = (username ? username : 'username');
    this.contact = (contact ? contact : 'email');
    this.password = (password ? password : 'password');
    this.status = (status ? status : 'status');
    this.map = mp;
    this.checkUsername = this.checkUsername.bind(this);
    this.checkContact = this.checkContact.bind(this);
    this.save = this.save.bind(this);
    this.verify = this.verify.bind(this);
    this.activate = this.activate.bind(this);
  }
  MongoRepository.prototype.checkUsername = function (username) {
    var _a;
    var query = (_a = {}, _a[this.username] = username, _a);
    return this.db.collection(this.user).countDocuments(query).then(function (v) { return v > 0; });
  };
  MongoRepository.prototype.checkContact = function (contact) {
    var _a;
    var query = (_a = {}, _a[this.contact] = contact, _a);
    return this.db.collection(this.user).countDocuments(query).then(function (v) { return v > 0; });
  };
  MongoRepository.prototype.save = function (id, info) {
    var _this = this;
    var user = {};
    if (this.map) {
      var c = clone(info);
      delete c['username'];
      delete c['contact'];
      delete c['password'];
      delete c['status'];
      user = map(c, this.map);
      user[this.status] = this.conf.registered;
      user['_id'] = id;
    }
    user[this.username] = info.username;
    user[this.contact] = info.contact;
    user[this.status] = this.conf.registered;
    user['_id'] = id;
    if (this.track) {
      var now = new Date();
      user[this.track.createdBy] = id;
      user[this.track.createdAt] = now;
      user[this.track.updatedBy] = id;
      user[this.track.updatedAt] = now;
      if (this.track.version && this.track.version.length > 0) {
        user[this.track.version] = 1;
      }
    }
    if (this.maxPasswordAge && this.maxPasswordAge > 0 && this.maxPasswordAgeField && this.maxPasswordAgeField.length > 0) {
      user[this.maxPasswordAgeField] = this.maxPasswordAge;
    }
    if (!info.password || info.password.length === 0) {
      return this.db.collection(this.user).insertOne(user).then(function (v) { return v.insertedCount > 0; });
    } else {
      if (this.user === this.authen) {
        user[this.password] = info.password;
        return this.db.collection(this.user).insertOne(user).then(function (v) { return v.insertedCount > 0; });
      } else {
        return this.db.collection(this.user).insertOne(user).then(function (v) {
          var _a;
          if (v.insertedCount > 0) {
            var p = (_a = {
              _id: id
            },
              _a[_this.password] = info.password,
              _a);
            var query_1 = { _id: id };
            return _this.db.collection(_this.authen).insertOne(p).then(function (v2) {
              if (v2.insertedCount > 0) {
                return true;
              } else {
                return _this.db.collection(_this.user).deleteOne(query_1).then(function () {
                  return false;
                });
              }
            }).catch(function (err) {
              return _this.db.collection(_this.user).deleteOne(query_1).then(function () {
                throw err;
              });
            });
          } else {
            return false;
          }
        });
      }
    }
  };
  MongoRepository.prototype.verify = function (id) {
    if (this.conf.registered === this.conf.codeSent) {
      return Promise.resolve(true);
    } else {
      var version = (this.track && this.track.version && this.track.version.length > 0 ? this.track.version : undefined);
      var ver = (version && version.length > 0 ? 2 : undefined);
      return updateStatus(id, this.db.collection(this.user), this.status, this.conf.registered, this.conf.codeSent, version, ver);
    }
  };
  MongoRepository.prototype.activate = function (id, password) {
    var _a;
    var _this = this;
    var version = (this.track && this.track.version && this.track.version.length > 0 ? this.track.version : undefined);
    var ver = (version && version.length > 0 ? (this.conf.registered === this.conf.codeSent ? 2 : 3) : undefined);
    if (!password || password.length === 0) {
      return updateStatus(id, this.db.collection(this.user), this.status, this.conf.codeSent, this.conf.activated, version, ver);
    } else {
      var query_2 = { _id: id };
      var obj_1 = (_a = {
        _id: id
      },
        _a[this.password] = password,
        _a);
      var p_1 = new Promise((function (resolve, reject) {
        _this.db.collection(_this.authen).findOneAndUpdate(query_2, { $set: obj_1 }, {
          upsert: true
        }, function (err, result) {
          if (err) {
            reject(err);
          } else {
            resolve(getAffectedRow(result) > 0);
          }
        });
      }));
      if (this.user === this.authen) {
        query_2[this.status] = this.conf.codeSent;
        obj_1[this.status] = this.conf.activated;
        return p_1;
      } else {
        return updateStatus(id, this.db.collection(this.user), this.status, this.conf.codeSent, this.conf.activated, version, ver).then(function (ok) {
          if (!ok) {
            return false;
          } else {
            return p_1;
          }
        });
      }
    }
  };
  return MongoRepository;
}());
exports.MongoRepository = MongoRepository;
function updateStatus(id, collection, status, from, to, version, ver) {
  var _a, _b;
  var query = (_a = {
    _id: id
  },
    _a[status] = from,
    _a);
  var obj = (_b = {
    _id: id
  },
    _b[status] = to,
    _b);
  if (version && ver !== undefined) {
    obj[version] = ver;
  }
  var updateQuery = {
    $set: obj
  };
  return collection.updateOne(query, updateQuery).then(function (res) { return res.modifiedCount + res.upsertedCount + res.matchedCount > 0; });
}
exports.updateStatus = updateStatus;
exports.MongoSignupRepository = MongoRepository;
exports.SignupRepository = MongoRepository;
exports.MongoSignupService = MongoRepository;
exports.SignupService = MongoRepository;
exports.UserRegistrationRepository = MongoRepository;
exports.MongoUserRegistrationRepository = MongoRepository;
function getAffectedRow(res) {
  return res.lastErrorObject ? res.lastErrorObject.n : (res.ok ? res.ok : 0);
}
exports.getAffectedRow = getAffectedRow;
function clone(obj) {
  var obj2 = {};
  var keys = Object.keys(obj);
  for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
    var key = keys_1[_i];
    obj2[key] = obj[key];
  }
  return obj2;
}
exports.clone = clone;
function map(obj, m) {
  if (!m) {
    return obj;
  }
  var mkeys = Object.keys(m);
  if (mkeys.length === 0) {
    return obj;
  }
  var obj2 = {};
  var keys = Object.keys(obj);
  for (var _i = 0, keys_2 = keys; _i < keys_2.length; _i++) {
    var key = keys_2[_i];
    var k0 = m[key];
    if (!k0) {
      k0 = key;
    }
    obj2[k0] = obj[key];
  }
  return obj2;
}
exports.map = map;
