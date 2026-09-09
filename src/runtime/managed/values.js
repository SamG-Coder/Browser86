// Managed values are data, never JavaScript source. MIT — samgcoder.
import {RuntimeFault} from '../errors.js';
export class Real { constructor(value){this.value=Number(value);} }
export class ManagedRef { constructor(get,set,type=null){this.get=get;this.set=set;this.type=type;} }
export class ManagedException extends Error {
 constructor(object){super(object.message||object.__type?.name||'Managed exception');this.object=object;}
}
export const NOT_HANDLED=Symbol('unimplemented managed member');
export const raw=v=>v instanceof Real?v.value:typeof v==='boolean'?+v:v;
export const number=v=>Number(raw(v));
export const unbox=v=>v?.__boxed?v.value:v;
export const deref=v=>v instanceof ManagedRef?v.get():v;
export const truth=v=>v!==null&&v!==undefined&&raw(v)!==0&&raw(v)!==0n;
export function copy(v){
 if(v?.__valueType){return {...v,fields:new Map([...v.fields||[]].map(([k,x])=>[k,copy(x)]))};}
 return v;
}
export function display(v,depth=0){
 v=deref(unbox(v));if(v===null||v===undefined)return '';
 if(v instanceof Real)return String(v.value);
 if(typeof v==='string'||typeof v==='number'||typeof v==='bigint'||typeof v==='boolean')return String(v);
 if(v.__array)return v.elementName+'[]';
 if(v.message!==undefined)return v.__type.name+': '+v.message;
 if(v.text!==undefined)return String(v.text);
 return v.__type?.name||'[managed object]';
}
export function requireRef(v){if(!(v instanceof ManagedRef))throw new RuntimeFault('CLR_INVALID_IL','Expected a managed reference.');return v;}
export function i32(v){return typeof raw(v)==='bigint'?Number(BigInt.asIntN(32,raw(v))):number(v)|0;}
export function u32(v){return typeof raw(v)==='bigint'?Number(BigInt.asUintN(32,raw(v))):number(v)>>>0;}
