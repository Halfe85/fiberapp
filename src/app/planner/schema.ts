export const SCHEMA=`
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,customer TEXT NOT NULL DEFAULT '',reference TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS buildings(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,name TEXT NOT NULL,address TEXT NOT NULL DEFAULT '',UNIQUE(project_id,name));
CREATE TABLE IF NOT EXISTS entrances(id TEXT PRIMARY KEY,building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,code TEXT NOT NULL,UNIQUE(building_id,code));
CREATE TABLE IF NOT EXISTS apartments(id TEXT PRIMARY KEY,entrance_id TEXT NOT NULL REFERENCES entrances(id) ON DELETE CASCADE,number TEXT NOT NULL,floor TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '',UNIQUE(entrance_id,number));
CREATE TABLE IF NOT EXISTS equipment(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,entrance_id TEXT REFERENCES entrances(id) ON DELETE CASCADE,apartment_id TEXT UNIQUE REFERENCES apartments(id) ON DELETE CASCADE,code TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('SWITCH','ODF','SPLICE_BOX','DISTRIBUTION_BOX','OUTLET')),place TEXT NOT NULL DEFAULT '',port_count INTEGER NOT NULL CHECK(port_count BETWEEN 1 AND 4096),UNIQUE(project_id,code));
CREATE TABLE IF NOT EXISTS ports(id TEXT PRIMARY KEY,equipment_id TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,label TEXT NOT NULL,position INTEGER NOT NULL,UNIQUE(equipment_id,position),UNIQUE(equipment_id,label));
CREATE TABLE IF NOT EXISTS links(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,from_port_id TEXT NOT NULL REFERENCES ports(id) ON DELETE CASCADE,to_port_id TEXT NOT NULL REFERENCES ports(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN ('CABLE','PATCH','SPLICE')),cable_id TEXT NOT NULL DEFAULT '',fiber_no TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '',CHECK(from_port_id<>to_port_id));
CREATE UNIQUE INDEX IF NOT EXISTS unique_cable_fiber ON links(project_id,cable_id,fiber_no) WHERE kind='CABLE' AND cable_id<>'' AND fiber_no<>'';
CREATE TRIGGER IF NOT EXISTS single_link_port BEFORE INSERT ON links BEGIN
SELECT RAISE(ABORT,'Porten er allerede benyttet') WHERE EXISTS(SELECT 1 FROM links WHERE from_port_id IN(NEW.from_port_id,NEW.to_port_id) OR to_port_id IN(NEW.from_port_id,NEW.to_port_id));
END;
PRAGMA user_version=1;`;
