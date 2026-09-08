export function updateGuestMenu(record,window,input){
  const serialized=JSON.stringify(window.menu);if(record.menuState===serialized)return;record.menuState=serialized;
  const wasOpen=new Set([...record.menuBar?.querySelectorAll('details[open]')||[]].map(node=>node.dataset.menu));
  if(!record.menuBar){record.menuBar=document.createElement('nav');record.menuBar.className='guest-menu-bar';record.menuBar.setAttribute('aria-label','Application menu');record.element.insertBefore(record.menuBar,record.client);}
  record.menuBar.replaceChildren();record.menuBar.hidden=!window.menu;
  const label=text=>text.replace(/&&/g,'\0').replace(/&/g,'').replace(/\0/g,'&');
  const build=(menu,parent)=>{for(const item of menu.items){
    if(item.flags&0x800||!item.text&&!item.submenu){parent.append(document.createElement('hr'));continue;}
    if(item.submenu){const details=document.createElement('details'),summary=document.createElement('summary'),content=document.createElement('div');details.dataset.menu=String(item.submenu.handle);summary.textContent=label(item.text);content.className='guest-menu-popup';details.append(summary,content);parent.append(details);build(item.submenu,content);details.open=wasOpen.has(details.dataset.menu);summary.addEventListener('click',event=>{if(item.flags&3){event.preventDefault();return;}if(!details.open)input({kind:'menu-open',hwnd:window.hwnd,menu:item.submenu.handle});});}
    else{const button=document.createElement('button');button.type='button';button.textContent=(item.flags&8?'\u2713 ':'')+label(item.text);button.disabled=!!(item.flags&3);button.addEventListener('click',()=>{input({kind:'menu',hwnd:window.hwnd,id:item.id});for(const details of record.menuBar.querySelectorAll('details'))details.open=false;});parent.append(button);}
  }};
  if(window.menu)build(window.menu,record.menuBar);
}
