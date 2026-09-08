import {checkBuffer} from './files.js';
import {RuntimeFault} from './errors.js';
export function installPolyDraw(gui){
  gui.api.add('gdi32.dll','PolyDraw',4,(h,input,types,count)=>{
    const dc=gui.dc(h);if(!dc)return gui.api.fail(6);count|=0;
    if(count<0||!input||!types)return 0;if(!count)return 1;
    if(count>1048576)throw new RuntimeFault('GDI_LIMIT','PolyDraw point count exceeds the runtime limit.');
    checkBuffer(gui.m,types,count,'r');checkBuffer(gui.m,input,count*8,'r');
    const point=i=>[gui.m.i32(input+i*8),gui.m.i32(input+i*8+4)],ops=[{kind:'move',points:[[dc.x,dc.y]]}];let end=[dc.x,dc.y],draws=false;
    for(let i=0;i<count;i++){
      let type=gui.m.u8(types+i);
      if(type===6){end=point(i);ops.push({kind:'move',points:[end]});continue;}
      if(type===2||type===3){end=point(i);ops.push({kind:'line',points:[end]});}
      else if(type===4&&i+2<count&&gui.m.u8(types+i+1)===4&&[4,5].includes(gui.m.u8(types+i+2))){const points=[point(i),point(i+1),point(i+2)];end=points[2];type=gui.m.u8(types+i+2);i+=2;ops.push({kind:'bezier',points});}
      else return gui.api.fail(87);
      draws=true;if(type&1){ops.push({kind:'close',points:[]});ops.push({kind:'move',points:[end]});}
    }
    if(draws)gui.draw(h,{op:'polydraw',ops,pen:gui.drawingObject(dc,dc.pen)});[dc.x,dc.y]=end;return 1;
  });
}
