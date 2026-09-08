export class PackageStore {
  constructor(){this.db=null;}
  async open(){if(this.db)return this.db;this.db=await new Promise((resolve,reject)=>{const request=indexedDB.open('browser86-packages',1);request.onupgradeneeded=()=>request.result.createObjectStore('packages',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Close other Browser86 tabs to update the package store.'));});return this.db;}
  async transaction(mode,work){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('packages',mode),store=tx.objectStore('packages');let value;try{const req=work(store);req.onsuccess=()=>{value=req.result;};req.onerror=()=>reject(req.error);}catch(e){reject(e);return;}tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Package transaction aborted.'));});}
  get(id){return this.transaction('readonly',s=>s.get(id));}
  put(pkg){return this.transaction('readwrite',s=>s.put(pkg));}
  remove(id){return this.transaction('readwrite',s=>s.delete(id));}
  async list(){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('packages','readonly'),req=tx.objectStore('packages').openCursor(),list=[];req.onsuccess=()=>{const cursor=req.result;if(cursor){const {id,name,updated,selected,executables}=cursor.value;list.push({id,name,updated,selected,count:executables?.length||0});cursor.continue();}else resolve(list.sort((a,b)=>b.updated-a.updated));};req.onerror=()=>reject(req.error);});}
}
