import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(style=8){const {p}=guest('HelloConsole.exe'),gui=p.apis.gui,u=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a);gui.classes.set('click',{style});for(const hwnd of [1,2])gui.windows.set(hwnd,{hwnd,className:'Click',x:0,y:0,style:0});const input=(event,timeStamp,button=0,x=0,y=0,hwnd=1)=>{gui.input({kind:'mouse',event,timeStamp,button,buttons:event==='up'?0:[1,4,2,8,16][button],x,y,hwnd});return p.messageQueue.at(-1);};return {p,gui,u,input};}
test('Double-click timing defaults, clamps unsigned input, preserves errors and is guest-local',()=>{
 const {p,u}=setup();for(const [value,time]of [[1,1],[0,500],[5001,5000],[-1,5000],[250,250]]){p.setError(1234);assert.equal(u('SetDoubleClickTime',value),1);assert.equal(u('GetDoubleClickTime'),time);assert.equal(p.lastError,1234);}assert.equal(setup().u('GetDoubleClickTime'),500);assert.equal(u('GetSystemMetrics',36),4);assert.equal(u('GetSystemMetrics',37),4);
});
test('All five buttons generate down-up-double-up sequences for CS_DBLCLKS',()=>{
 for(const [button,base]of [[0,0x201],[1,0x207],[2,0x204],[3,0x20b],[4,0x20b]]){const {input}=setup();assert.equal(input('down',0,button).message,base);assert.equal(input('up',10,button).message,base+1);const dbl=input('down',100,button);assert.equal(dbl.message,base+2);if(button>=3)assert.equal(dbl.wParam>>>16,button-2);assert.equal(input('up',110,button).message,base+1);assert.equal(input('down',150,button).message,base);}
});
test('Class opt-in, release, timing, button and target boundaries prevent false double clicks',()=>{
 let s=setup(0);s.input('down',0);s.input('up',1);assert.equal(s.input('down',2).message,0x201);
 for(const second of [{event:'down',time:10,release:false},{event:'down',time:501},{event:'down',time:10,button:2},{event:'down',time:10,hwnd:2}]){s=setup();s.input('down',0);if(second.release!==false)s.input('up',1);assert.equal(s.input(second.event,second.time,second.button??0,0,0,second.hwnd??1).message,second.button===2?0x204:0x201);}
});
test('Double-click spatial bounds use the exposed rectangle in virtual screen coordinates',()=>{
 for(const [x,expected]of [[-2,0x203],[1,0x203],[2,0x201],[-3,0x201]]){const {input}=setup();input('down',0);input('up',1);assert.equal(input('down',10,0,x).message,expected);}
 const {gui,input}=setup();input('down',0);input('up',1);gui.windows.get(1).x=10;assert.equal(input('down',10).message,0x201);
});
test('Capture routes double clicks to the capture owner and retains mapped coordinates',()=>{
 const {gui,input}=setup();gui.capture=2;gui.windows.get(2).x=20;input('down',0);input('up',1);const result=input('down',100);assert.equal(result.hwnd,2);assert.equal(result.message,0x203);assert.equal(result.lParam,65516);
});
