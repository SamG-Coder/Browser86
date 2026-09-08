const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text)n.textContent=text;return n;};
export class DesktopShell{
 constructor(actions){
  this.actions=actions;document.body.classList.add('desktop-shell');
  const sidebar=document.querySelector('.sidebar');this.sidebar=sidebar;sidebar.hidden=true;sidebar.setAttribute('aria-label','Application drive');
  const bar=el('div','shell-window-bar'),label=el('strong','','Applications'),close=el('button','','×');close.title='Close application launcher';close.onclick=()=>this.launcher(false);bar.append(label,close);sidebar.prepend(bar);this.label=label;
  const desktop=document.getElementById('desktop');this.icons=el('div','desktop-icons');this.icons.setAttribute('aria-label','Application drives');desktop.prepend(this.icons);
  const empty=document.getElementById('desktop-empty');empty.replaceChildren();const mark=el('div','welcome-mark','86'),title=el('h3','','Your applications. Your desktop.'),text=el('p','','Drop an EXE or application ZIP anywhere to get started. Each package has its own private virtual C: drive, saved in this browser.'),importButton=el('button','welcome-import','Import EXE or ZIP'),demo=el('button','welcome-demo','Try the demo');importButton.onclick=actions.importZip;demo.onclick=()=>document.getElementById('load-demo').click();empty.append(mark,title,text,importButton,demo);
  const tabs=document.querySelector('.tabbar'),library=el('button','shell-library','▦  Applications');library.onclick=()=>this.launcher(this.sidebar.hidden);tabs.prepend(library);
  const add=el('button','shell-import','＋ Import');add.onclick=actions.importZip;tabs.append(add);
  const heading=document.querySelector('.workspace-heading .section-eyebrow');heading.textContent='BROWSER86 DESKTOP';
  const top=document.querySelector('.top-tags');top.replaceChildren(el('span','tag','Isolated application drives'),el('span','tag subtle','Saved on this device'));
  document.querySelector('.brand small').textContent='YOUR VIRTUAL DESKTOP';
  const files=document.getElementById('tab-files'),filebar=el('div','shell-window-bar'),filetitle=el('strong','','File Explorer'),fileclose=el('button','','×');fileclose.title='Close File Explorer';fileclose.onclick=actions.showDesktop;filebar.append(filetitle,fileclose);files.prepend(filebar);this.filetitle=filetitle;
  const hint=el('div','drive-hint','Virtual C: drive · Only this application can access these files. Double-click an EXE to run it.');files.insertBefore(hint,files.children[1]);
  for(const name of ['terminal','debugger','compatibility']){const panel=document.getElementById('tab-'+name),bar=el('div','shell-window-bar'),close=el('button','','×');close.title='Return to desktop';close.onclick=actions.showDesktop;bar.append(el('strong','',name==='terminal'?'Logs':name==='debugger'?'Developer tools':'Compatibility'),close);panel.prepend(bar);}
  document.querySelector('.sidebar h1').textContent='Application drive';document.querySelector('.sidebar .intro').textContent='Every package has a separate virtual C: drive. Choose an executable below or browse its files.';
  const browse=el('button','browse-drive','▰  Open virtual C: drive');browse.onclick=actions.openDrive;document.getElementById('run').before(browse);
 }
 launcher(visible){this.sidebar.hidden=!visible;}
 packageName(name){const clean=name.replace(/\.zip$/i,'');this.label.textContent=clean;this.filetitle.textContent=clean+' — Virtual Disk (C:)';}
 view(name){document.body.dataset.shellView=name;}
 packages(packages,selected){this.icons.replaceChildren();document.body.classList.toggle('has-packages',packages.length>0);for(const pkg of packages){const b=el('button','desktop-icon'),icon=el('span','drive-icon','▰'),label=el('span','desktop-icon-label',pkg.name.replace(/\.zip$/i,'')),detail=el('small','','Virtual C: drive');b.append(icon,label,detail);b.title='Open '+pkg.name+' — isolated virtual C: drive';b.setAttribute('aria-label','Open '+pkg.name);b.onclick=()=>{for(const child of this.icons.children)child.classList.remove('selected');b.classList.add('selected');};b.ondblclick=()=>this.actions.openPackage(pkg.id);b.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();this.actions.openPackage(pkg.id);}};if(pkg.id===selected)b.classList.add('selected');this.icons.append(b);}}
}
