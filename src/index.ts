import {Collection, Db} from 'mongodb';

export interface User {
  username: string;
  password: string;
  contact: string;
}
export interface UserStatus {
  registered: string;
  codeSent: string;
  activated: string;
}
export interface StringMap {
  [key: string]: string;
}
export interface Track {
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  version?: string;
}
export interface FieldConfig {
  username?: string;
  contact?: string;
  password?: string;
  status?: string;
  maxPasswordAge?: string;
}
export function useRepository<ID, T extends User>(db: Db, user: string, authen: string, conf: UserStatus, c?: FieldConfig, maxPasswordAge?: number, track?: Track, mp?: StringMap): MongoRepository<ID, T> {
  if (c) {
    return new MongoRepository(db, user, authen, conf, maxPasswordAge, c.maxPasswordAge, c.contact, c.username, c.status, c.password, track, mp);
  } else {
    return new MongoRepository(db, user, authen, conf, maxPasswordAge, undefined, undefined, undefined, undefined, undefined, track, mp);
  }
}
export const useService = useRepository;
export const useSignupService = useRepository;
export const useSignupRepository = useRepository;
export const useSignup = useRepository;
export const useUserRegistrationService = useRepository;
export const useUserRegistrationRepository = useRepository;
export const useUserRegistration = useRepository;
export class MongoRepository<ID, T extends User> {
  constructor(public db: Db, public user: string, public authen: string, public conf: UserStatus, public maxPasswordAge?: number, public maxPasswordAgeField?: string, contact?: string, username?: string, status?: string, password?: string, public track?: Track, mp?: StringMap) {
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
  map?: StringMap;
  username: string;
  contact: string;
  password: string;
  status: string;
  checkUsername(username: string): Promise<boolean> {
    const query = {[this.username]: username};
    return this.db.collection(this.user).countDocuments(query).then((v: number) => v > 0);
  }
  checkContact(contact: string): Promise<boolean> {
    const query = {[this.contact]: contact};
    return this.db.collection(this.user).countDocuments(query).then((v: number) => v > 0);
  }
  save(id: ID, info: T): Promise<boolean> {
    let user: any = {};
    if (this.map) {
      const c: any = clone(info);
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
      const now = new Date();
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
      return this.db.collection(this.user).insertOne(user).then((v: { insertedCount: number; }) => v.insertedCount > 0);
    } else {
      if (this.user === this.authen) {
        user[this.password] = info.password;
        return this.db.collection(this.user).insertOne(user).then((v: { insertedCount: number; }) => v.insertedCount > 0);
      } else {
        return this.db.collection(this.user).insertOne(user).then((v: { insertedCount: number; }) => {
          if (v.insertedCount > 0) {
            const p: any = {
              _id: id,
              [this.password]: info.password
            };
            const query = {_id: id};
            return this.db.collection(this.authen).insertOne(p).then((v2: { insertedCount: number; }) => {
              if (v2.insertedCount > 0) {
                return true;
              } else {
                return this.db.collection(this.user).deleteOne(query).then(() => {
                  return false;
                });
              }
            }).catch((err: any) => {
              return this.db.collection(this.user).deleteOne(query).then(() => {
                throw err;
              });
            });
          } else {
            return false;
          }
        });
      }
    }
  }
  verify(id: ID): Promise<boolean> {
    if (this.conf.registered === this.conf.codeSent) {
      return Promise.resolve(true);
    } else {
      const version = (this.track && this.track.version && this.track.version.length > 0 ? this.track.version : undefined);
      const ver = (version && version.length > 0 ? 2 : undefined);
      return updateStatus(id, this.db.collection(this.user), this.status, this.conf.registered, this.conf.codeSent, version, ver);
    }
  }
  activate(id: ID, password?: string): Promise<boolean> {
    const version = (this.track && this.track.version && this.track.version.length > 0 ? this.track.version : undefined);
    const ver = (version && version.length > 0 ? (this.conf.registered === this.conf.codeSent ? 2 : 3) : undefined);
    if (!password || password.length === 0) {
      return updateStatus(id, this.db.collection(this.user), this.status, this.conf.codeSent, this.conf.activated, version, ver);
    } else {
      const query: any = { _id: id };
      const obj: any = {
        _id: id,
        [this.password]: password
      };
      const p = new Promise<boolean>(((resolve, reject) => {
        this.db.collection(this.authen).findOneAndUpdate(query, { $set: obj }, {
          upsert: true
        }, (err: any, result: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(getAffectedRow(result) > 0);
          }
        });
      }));
      if (this.user === this.authen) {
        query[this.status] = this.conf.codeSent;
        obj[this.status] = this.conf.activated;
        return p;
      } else {
        return updateStatus(id, this.db.collection(this.user), this.status, this.conf.codeSent, this.conf.activated, version, ver).then(ok => {
          if (!ok) {
            return false;
          } else {
            return p;
          }
        });
      }
    }
  }
}
export function updateStatus<ID>(id: ID, collection: Collection, status: string, from: string, to: string, version?: string, ver?: number): Promise<boolean> {
  const query = {
    _id: id,
    [status]: from
  };
  const obj: any = {
    _id: id,
    [status]: to
  };
  if (version && ver !== undefined) {
    obj[version] = ver;
  }
  const updateQuery = {
    $set: obj
  };
  return collection.updateOne(query, updateQuery).then((res: { modifiedCount: any; upsertedCount: any; matchedCount: any; }) => res.modifiedCount + res.upsertedCount + res.matchedCount > 0);
}
export const MongoSignupRepository = MongoRepository;
export const SignupRepository = MongoRepository;
export const MongoSignupService = MongoRepository;
export const SignupService = MongoRepository;
export const UserRegistrationRepository = MongoRepository;
export const MongoUserRegistrationRepository = MongoRepository;
export function getAffectedRow(res: any): number {
  return res.lastErrorObject ? res.lastErrorObject.n : (res.ok ? res.ok : 0);
}
export function clone<T>(obj: T): T {
  const obj2: any = {};
  const keys = Object.keys(obj);
  for (const key of keys) {
    obj2[key] = (obj as any)[key];
  }
  return obj2;
}
export function map<T>(obj: T, m?: StringMap): any {
  if (!m) {
    return obj;
  }
  const mkeys = Object.keys(m);
  if (mkeys.length === 0) {
    return obj;
  }
  const obj2: any = {};
  const keys = Object.keys(obj);
  for (const key of keys) {
    let k0 = m[key];
    if (!k0) {
      k0 = key;
    }
    obj2[k0] = (obj as any)[key];
  }
  return obj2;
}
