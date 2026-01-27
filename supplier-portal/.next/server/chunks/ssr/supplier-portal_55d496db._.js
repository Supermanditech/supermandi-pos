module.exports=[64072,a=>{"use strict";var b=a.i(91971),c=a.i(46591),d=a.i(70847),e=class extends c.Removable{#a;#b;#c;#d;constructor(a){super(),this.#a=a.client,this.mutationId=a.mutationId,this.#c=a.mutationCache,this.#b=[],this.state=a.state||f(),this.setOptions(a.options),this.scheduleGc()}setOptions(a){this.options=a,this.updateGcTime(this.options.gcTime)}get meta(){return this.options.meta}addObserver(a){this.#b.includes(a)||(this.#b.push(a),this.clearGcTimeout(),this.#c.notify({type:"observerAdded",mutation:this,observer:a}))}removeObserver(a){this.#b=this.#b.filter(b=>b!==a),this.scheduleGc(),this.#c.notify({type:"observerRemoved",mutation:this,observer:a})}optionalRemove(){this.#b.length||("pending"===this.state.status?this.scheduleGc():this.#c.remove(this))}continue(){return this.#d?.continue()??this.execute(this.state.variables)}async execute(a){let b=()=>{this.#e({type:"continue"})},c={client:this.#a,meta:this.options.meta,mutationKey:this.options.mutationKey};this.#d=(0,d.createRetryer)({fn:()=>this.options.mutationFn?this.options.mutationFn(a,c):Promise.reject(Error("No mutationFn found")),onFail:(a,b)=>{this.#e({type:"failed",failureCount:a,error:b})},onPause:()=>{this.#e({type:"pause"})},onContinue:b,retry:this.options.retry??0,retryDelay:this.options.retryDelay,networkMode:this.options.networkMode,canRun:()=>this.#c.canRun(this)});let e="pending"===this.state.status,f=!this.#d.canStart();try{if(e)b();else{this.#e({type:"pending",variables:a,isPaused:f}),this.#c.config.onMutate&&await this.#c.config.onMutate(a,this,c);let b=await this.options.onMutate?.(a,c);b!==this.state.context&&this.#e({type:"pending",context:b,variables:a,isPaused:f})}let d=await this.#d.start();return await this.#c.config.onSuccess?.(d,a,this.state.context,this,c),await this.options.onSuccess?.(d,a,this.state.context,c),await this.#c.config.onSettled?.(d,null,this.state.variables,this.state.context,this,c),await this.options.onSettled?.(d,null,a,this.state.context,c),this.#e({type:"success",data:d}),d}catch(b){try{await this.#c.config.onError?.(b,a,this.state.context,this,c)}catch(a){Promise.reject(a)}try{await this.options.onError?.(b,a,this.state.context,c)}catch(a){Promise.reject(a)}try{await this.#c.config.onSettled?.(void 0,b,this.state.variables,this.state.context,this,c)}catch(a){Promise.reject(a)}try{await this.options.onSettled?.(void 0,b,a,this.state.context,c)}catch(a){Promise.reject(a)}throw this.#e({type:"error",error:b}),b}finally{this.#c.runNext(this)}}#e(a){this.state=(b=>{switch(a.type){case"failed":return{...b,failureCount:a.failureCount,failureReason:a.error};case"pause":return{...b,isPaused:!0};case"continue":return{...b,isPaused:!1};case"pending":return{...b,context:a.context,data:void 0,failureCount:0,failureReason:null,error:null,isPaused:a.isPaused,status:"pending",variables:a.variables,submittedAt:Date.now()};case"success":return{...b,data:a.data,failureCount:0,failureReason:null,error:null,status:"success",isPaused:!1};case"error":return{...b,data:void 0,error:a.error,failureCount:b.failureCount+1,failureReason:a.error,isPaused:!1,status:"error"}}})(this.state),b.notifyManager.batch(()=>{this.#b.forEach(b=>{b.onMutationUpdate(a)}),this.#c.notify({mutation:this,type:"updated",action:a})})}};function f(){return{context:void 0,data:void 0,error:null,failureCount:0,failureReason:null,isPaused:!1,status:"idle",variables:void 0,submittedAt:0}}a.s(["Mutation",()=>e,"getDefaultState",()=>f])},11467,a=>{"use strict";let b="http://localhost:3000";class c extends Error{status;code;constructor(a,b,c){super(c),this.status=a,this.code=b,this.name="ApiError"}}function d(){return null}function e(a){localStorage.setItem("supplier_token",a)}function f(){localStorage.removeItem("supplier_token")}async function g(a,e={}){let f=d(),h={"Content-Type":"application/json",...e.headers};f&&(h.Authorization=`Bearer ${f}`);let i=await fetch(`${b}${a}`,{...e,headers:h}),j=await i.json();if(!i.ok)throw new c(i.status,j.error?.code||"UNKNOWN",j.error?.message||"Request failed");return j.data??j}async function h(a){let b=await g("/api/v1/supplier/auth/register",{method:"POST",body:JSON.stringify(a)});return e(b.token),b}async function i(a){let b=await g("/api/v1/supplier/auth/login",{method:"POST",body:JSON.stringify(a)});return e(b.token),b}async function j(){return g("/api/v1/supplier/profile")}async function k(a){return g("/api/v1/supplier/profile",{method:"PATCH",body:JSON.stringify(a)})}async function l(a){await g("/api/v1/supplier/auth/change-password",{method:"POST",body:JSON.stringify(a)})}async function m(){return g("/api/v1/supplier/products")}async function n(a){return g("/api/v1/supplier/products",{method:"POST",body:JSON.stringify(a)})}async function o(a,b){return g(`/api/v1/supplier/products/${a}`,{method:"PATCH",body:JSON.stringify(b)})}async function p(a){await g(`/api/v1/supplier/products/${a}`,{method:"DELETE"})}async function q(){return g("/api/v1/supplier/orders")}async function r(a,b){return g(`/api/v1/supplier/orders/${a}/status`,{method:"PATCH",body:JSON.stringify({status:b})})}async function s(){return g("/api/v1/supplier/dashboard/stats")}async function t(a){let e=new FormData;e.append("file",a);let f=d(),g=await fetch(`${b}/api/v1/supplier/products/csv-upload`,{method:"POST",headers:f?{Authorization:`Bearer ${f}`}:{},body:e}),h=await g.json();if(!g.ok)throw new c(g.status,h.error?.code||"UNKNOWN",h.error?.message||"Upload failed");return h.data}a.s(["ApiError",()=>c,"changePassword",()=>l,"clearAuthToken",()=>f,"createProduct",()=>n,"deleteProduct",()=>p,"getAuthToken",()=>d,"getDashboardStats",()=>s,"getOrders",()=>q,"getProducts",()=>m,"getSupplierProfile",()=>j,"loginSupplier",()=>i,"registerSupplier",()=>h,"updateOrderStatus",()=>r,"updateProduct",()=>o,"updateSupplierProfile",()=>k,"uploadProductsCsv",()=>t])},36448,a=>{"use strict";let b,c;var d,e=a.i(65893);let f={data:""},g=/(?:([\u0080-\uFFFF\w-%@]+) *:? *([^{;]+?);|([^;}{]*?) *{)|(}\s*)/g,h=/\/\*[^]*?\*\/|  +/g,i=/\n+/g,j=(a,b)=>{let c="",d="",e="";for(let f in a){let g=a[f];"@"==f[0]?"i"==f[1]?c=f+" "+g+";":d+="f"==f[1]?j(g,f):f+"{"+j(g,"k"==f[1]?"":b)+"}":"object"==typeof g?d+=j(g,b?b.replace(/([^,])+/g,a=>f.replace(/([^,]*:\S+\([^)]*\))|([^,])+/g,b=>/&/.test(b)?b.replace(/&/g,a):a?a+" "+b:b)):f):null!=g&&(f=/^--/.test(f)?f:f.replace(/[A-Z]/g,"-$&").toLowerCase(),e+=j.p?j.p(f,g):f+":"+g+";")}return c+(b&&e?b+"{"+e+"}":e)+d},k={},l=a=>{if("object"==typeof a){let b="";for(let c in a)b+=c+l(a[c]);return b}return a};function m(a){let b,c,d=this||{},e=a.call?a(d.p):a;return((a,b,c,d,e)=>{var f;let m=l(a),n=k[m]||(k[m]=(a=>{let b=0,c=11;for(;b<a.length;)c=101*c+a.charCodeAt(b++)>>>0;return"go"+c})(m));if(!k[n]){let b=m!==a?a:(a=>{let b,c,d=[{}];for(;b=g.exec(a.replace(h,""));)b[4]?d.shift():b[3]?(c=b[3].replace(i," ").trim(),d.unshift(d[0][c]=d[0][c]||{})):d[0][b[1]]=b[2].replace(i," ").trim();return d[0]})(a);k[n]=j(e?{["@keyframes "+n]:b}:b,c?"":"."+n)}let o=c&&k.g?k.g:null;return c&&(k.g=k[n]),f=k[n],o?b.data=b.data.replace(o,f):-1===b.data.indexOf(f)&&(b.data=d?f+b.data:b.data+f),n})(e.unshift?e.raw?(b=[].slice.call(arguments,1),c=d.p,e.reduce((a,d,e)=>{let f=b[e];if(f&&f.call){let a=f(c),b=a&&a.props&&a.props.className||/^go/.test(a)&&a;f=b?"."+b:a&&"object"==typeof a?a.props?"":j(a,""):!1===a?"":a}return a+d+(null==f?"":f)},"")):e.reduce((a,b)=>Object.assign(a,b&&b.call?b(d.p):b),{}):e,d.target||f,d.g,d.o,d.k)}m.bind({g:1});let n,o,p,q=m.bind({k:1});function r(a,b){let c=this||{};return function(){let d=arguments;function e(f,g){let h=Object.assign({},f),i=h.className||e.className;c.p=Object.assign({theme:o&&o()},h),c.o=/ *go\d+/.test(i),h.className=m.apply(c,d)+(i?" "+i:""),b&&(h.ref=g);let j=a;return a[0]&&(j=h.as||a,delete h.as),p&&j[0]&&p(h),n(j,h)}return b?b(e):e}}var s=(a,b)=>"function"==typeof a?a(b):a,t=(b=0,()=>(++b).toString()),u="default",v=(a,b)=>{let{toastLimit:c}=a.settings;switch(b.type){case 0:return{...a,toasts:[b.toast,...a.toasts].slice(0,c)};case 1:return{...a,toasts:a.toasts.map(a=>a.id===b.toast.id?{...a,...b.toast}:a)};case 2:let{toast:d}=b;return v(a,{type:+!!a.toasts.find(a=>a.id===d.id),toast:d});case 3:let{toastId:e}=b;return{...a,toasts:a.toasts.map(a=>a.id===e||void 0===e?{...a,dismissed:!0,visible:!1}:a)};case 4:return void 0===b.toastId?{...a,toasts:[]}:{...a,toasts:a.toasts.filter(a=>a.id!==b.toastId)};case 5:return{...a,pausedAt:b.time};case 6:let f=b.time-(a.pausedAt||0);return{...a,pausedAt:void 0,toasts:a.toasts.map(a=>({...a,pauseDuration:a.pauseDuration+f}))}}},w=[],x={toasts:[],pausedAt:void 0,settings:{toastLimit:20}},y={},z=(a,b=u)=>{y[b]=v(y[b]||x,a),w.forEach(([a,c])=>{a===b&&c(y[b])})},A=a=>Object.keys(y).forEach(b=>z(a,b)),B=(a=u)=>b=>{z(b,a)},C={blank:4e3,error:4e3,success:2e3,loading:1/0,custom:4e3},D=a=>(b,c)=>{let d,e=((a,b="blank",c)=>({createdAt:Date.now(),visible:!0,dismissed:!1,type:b,ariaProps:{role:"status","aria-live":"polite"},message:a,pauseDuration:0,...c,id:(null==c?void 0:c.id)||t()}))(b,a,c);return B(e.toasterId||(d=e.id,Object.keys(y).find(a=>y[a].toasts.some(a=>a.id===d))))({type:2,toast:e}),e.id},E=(a,b)=>D("blank")(a,b);E.error=D("error"),E.success=D("success"),E.loading=D("loading"),E.custom=D("custom"),E.dismiss=(a,b)=>{let c={type:3,toastId:a};b?B(b)(c):A(c)},E.dismissAll=a=>E.dismiss(void 0,a),E.remove=(a,b)=>{let c={type:4,toastId:a};b?B(b)(c):A(c)},E.removeAll=a=>E.remove(void 0,a),E.promise=(a,b,c)=>{let d=E.loading(b.loading,{...c,...null==c?void 0:c.loading});return"function"==typeof a&&(a=a()),a.then(a=>{let e=b.success?s(b.success,a):void 0;return e?E.success(e,{id:d,...c,...null==c?void 0:c.success}):E.dismiss(d),a}).catch(a=>{let e=b.error?s(b.error,a):void 0;e?E.error(e,{id:d,...c,...null==c?void 0:c.error}):E.dismiss(d)}),a};var F=1e3,G=q`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
 transform: scale(1) rotate(45deg);
  opacity: 1;
}`,H=q`
from {
  transform: scale(0);
  opacity: 0;
}
to {
  transform: scale(1);
  opacity: 1;
}`,I=q`
from {
  transform: scale(0) rotate(90deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(90deg);
	opacity: 1;
}`,J=r("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${a=>a.primary||"#ff4b4b"};
  position: relative;
  transform: rotate(45deg);

  animation: ${G} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;

  &:after,
  &:before {
    content: '';
    animation: ${H} 0.15s ease-out forwards;
    animation-delay: 150ms;
    position: absolute;
    border-radius: 3px;
    opacity: 0;
    background: ${a=>a.secondary||"#fff"};
    bottom: 9px;
    left: 4px;
    height: 2px;
    width: 12px;
  }

  &:before {
    animation: ${I} 0.15s ease-out forwards;
    animation-delay: 180ms;
    transform: rotate(90deg);
  }
`,K=q`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`,L=r("div")`
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 2px solid;
  border-radius: 100%;
  border-color: ${a=>a.secondary||"#e0e0e0"};
  border-right-color: ${a=>a.primary||"#616161"};
  animation: ${K} 1s linear infinite;
`,M=q`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(45deg);
	opacity: 1;
}`,N=q`
0% {
	height: 0;
	width: 0;
	opacity: 0;
}
40% {
  height: 0;
	width: 6px;
	opacity: 1;
}
100% {
  opacity: 1;
  height: 10px;
}`,O=r("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${a=>a.primary||"#61d345"};
  position: relative;
  transform: rotate(45deg);

  animation: ${M} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;
  &:after {
    content: '';
    box-sizing: border-box;
    animation: ${N} 0.2s ease-out forwards;
    opacity: 0;
    animation-delay: 200ms;
    position: absolute;
    border-right: 2px solid;
    border-bottom: 2px solid;
    border-color: ${a=>a.secondary||"#fff"};
    bottom: 6px;
    left: 6px;
    height: 10px;
    width: 6px;
  }
`,P=r("div")`
  position: absolute;
`,Q=r("div")`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 20px;
  min-height: 20px;
`,R=q`
from {
  transform: scale(0.6);
  opacity: 0.4;
}
to {
  transform: scale(1);
  opacity: 1;
}`,S=r("div")`
  position: relative;
  transform: scale(0.6);
  opacity: 0.4;
  min-width: 20px;
  animation: ${R} 0.3s 0.12s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
`,T=({toast:a})=>{let{icon:b,type:c,iconTheme:d}=a;return void 0!==b?"string"==typeof b?e.createElement(S,null,b):b:"blank"===c?null:e.createElement(Q,null,e.createElement(L,{...d}),"loading"!==c&&e.createElement(P,null,"error"===c?e.createElement(J,{...d}):e.createElement(O,{...d})))},U=r("div")`
  display: flex;
  align-items: center;
  background: #fff;
  color: #363636;
  line-height: 1.3;
  will-change: transform;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1), 0 3px 3px rgba(0, 0, 0, 0.05);
  max-width: 350px;
  pointer-events: auto;
  padding: 8px 10px;
  border-radius: 8px;
`,V=r("div")`
  display: flex;
  justify-content: center;
  margin: 4px 10px;
  color: inherit;
  flex: 1 1 auto;
  white-space: pre-line;
`,W=e.memo(({toast:a,position:b,style:d,children:f})=>{let g=a.height?((a,b)=>{let d=a.includes("top")?1:-1,[e,f]=c?["0%{opacity:0;} 100%{opacity:1;}","0%{opacity:1;} 100%{opacity:0;}"]:[`
0% {transform: translate3d(0,${-200*d}%,0) scale(.6); opacity:.5;}
100% {transform: translate3d(0,0,0) scale(1); opacity:1;}
`,`
0% {transform: translate3d(0,0,-1px) scale(1); opacity:1;}
100% {transform: translate3d(0,${-150*d}%,-1px) scale(.6); opacity:0;}
`];return{animation:b?`${q(e)} 0.35s cubic-bezier(.21,1.02,.73,1) forwards`:`${q(f)} 0.4s forwards cubic-bezier(.06,.71,.55,1)`}})(a.position||b||"top-center",a.visible):{opacity:0},h=e.createElement(T,{toast:a}),i=e.createElement(V,{...a.ariaProps},s(a.message,a));return e.createElement(U,{className:a.className,style:{...g,...d,...a.style}},"function"==typeof f?f({icon:h,message:i}):e.createElement(e.Fragment,null,h,i))});d=e.createElement,j.p=void 0,n=d,o=void 0,p=void 0;var X=({id:a,className:b,style:c,onHeightUpdate:d,children:f})=>{let g=e.useCallback(b=>{if(b){let c=()=>{d(a,b.getBoundingClientRect().height)};c(),new MutationObserver(c).observe(b,{subtree:!0,childList:!0,characterData:!0})}},[a,d]);return e.createElement("div",{ref:g,className:b,style:c},f)},Y=m`
  z-index: 9999;
  > * {
    pointer-events: auto;
  }
`,Z=({reverseOrder:a,position:b="top-center",toastOptions:d,gutter:f,children:g,toasterId:h,containerStyle:i,containerClassName:j})=>{let{toasts:k,handlers:l}=((a,b="default")=>{let{toasts:c,pausedAt:d}=((a={},b=u)=>{let[c,d]=(0,e.useState)(y[b]||x),f=(0,e.useRef)(y[b]);(0,e.useEffect)(()=>(f.current!==y[b]&&d(y[b]),w.push([b,d]),()=>{let a=w.findIndex(([a])=>a===b);a>-1&&w.splice(a,1)}),[b]);let g=c.toasts.map(b=>{var c,d,e;return{...a,...a[b.type],...b,removeDelay:b.removeDelay||(null==(c=a[b.type])?void 0:c.removeDelay)||(null==a?void 0:a.removeDelay),duration:b.duration||(null==(d=a[b.type])?void 0:d.duration)||(null==a?void 0:a.duration)||C[b.type],style:{...a.style,...null==(e=a[b.type])?void 0:e.style,...b.style}}});return{...c,toasts:g}})(a,b),f=(0,e.useRef)(new Map).current,g=(0,e.useCallback)((a,b=F)=>{if(f.has(a))return;let c=setTimeout(()=>{f.delete(a),h({type:4,toastId:a})},b);f.set(a,c)},[]);(0,e.useEffect)(()=>{if(d)return;let a=Date.now(),e=c.map(c=>{if(c.duration===1/0)return;let d=(c.duration||0)+c.pauseDuration-(a-c.createdAt);if(d<0){c.visible&&E.dismiss(c.id);return}return setTimeout(()=>E.dismiss(c.id,b),d)});return()=>{e.forEach(a=>a&&clearTimeout(a))}},[c,d,b]);let h=(0,e.useCallback)(B(b),[b]),i=(0,e.useCallback)(()=>{h({type:5,time:Date.now()})},[h]),j=(0,e.useCallback)((a,b)=>{h({type:1,toast:{id:a,height:b}})},[h]),k=(0,e.useCallback)(()=>{d&&h({type:6,time:Date.now()})},[d,h]),l=(0,e.useCallback)((a,b)=>{let{reverseOrder:d=!1,gutter:e=8,defaultPosition:f}=b||{},g=c.filter(b=>(b.position||f)===(a.position||f)&&b.height),h=g.findIndex(b=>b.id===a.id),i=g.filter((a,b)=>b<h&&a.visible).length;return g.filter(a=>a.visible).slice(...d?[i+1]:[0,i]).reduce((a,b)=>a+(b.height||0)+e,0)},[c]);return(0,e.useEffect)(()=>{c.forEach(a=>{if(a.dismissed)g(a.id,a.removeDelay);else{let b=f.get(a.id);b&&(clearTimeout(b),f.delete(a.id))}})},[c,g]),{toasts:c,handlers:{updateHeight:j,startPause:i,endPause:k,calculateOffset:l}}})(d,h);return e.createElement("div",{"data-rht-toaster":h||"",style:{position:"fixed",zIndex:9999,top:16,left:16,right:16,bottom:16,pointerEvents:"none",...i},className:j,onMouseEnter:l.startPause,onMouseLeave:l.endPause},k.map(d=>{let h,i,j=d.position||b,k=l.calculateOffset(d,{reverseOrder:a,gutter:f,defaultPosition:b}),m=(h=j.includes("top"),i=j.includes("center")?{justifyContent:"center"}:j.includes("right")?{justifyContent:"flex-end"}:{},{left:0,right:0,display:"flex",position:"absolute",transition:c?void 0:"all 230ms cubic-bezier(.21,1.02,.73,1)",transform:`translateY(${k*(h?1:-1)}px)`,...h?{top:0}:{bottom:0},...i});return e.createElement(X,{id:d.id,key:d.id,onHeightUpdate:l.updateHeight,className:d.visible?Y:"",style:m},"custom"===d.type?s(d.message,d):g?g(d):e.createElement(W,{toast:d,position:j}))}))};a.s(["Toaster",()=>Z,"default",()=>E],36448)},63606,a=>{"use strict";var b={setTimeout:(a,b)=>setTimeout(a,b),clearTimeout:a=>clearTimeout(a),setInterval:(a,b)=>setInterval(a,b),clearInterval:a=>clearInterval(a)},c=new class{#f=b;#g=!1;setTimeoutProvider(a){this.#f=a}setTimeout(a,b){return this.#f.setTimeout(a,b)}clearTimeout(a){this.#f.clearTimeout(a)}setInterval(a,b){return this.#f.setInterval(a,b)}clearInterval(a){this.#f.clearInterval(a)}};function d(a){setTimeout(a,0)}a.s(["systemSetTimeoutZero",()=>d,"timeoutManager",()=>c])},56487,a=>{"use strict";var b=a.i(63606);function c(){}function d(a,b){return"function"==typeof a?a(b):a}function e(a){return"number"==typeof a&&a>=0&&a!==1/0}function f(a,b){return Math.max(a+(b||0)-Date.now(),0)}function g(a,b){return"function"==typeof a?a(b):a}function h(a,b){return"function"==typeof a?a(b):a}function i(a,b){let{type:c="all",exact:d,fetchStatus:e,predicate:f,queryKey:g,stale:h}=a;if(g){if(d){if(b.queryHash!==k(g,b.options))return!1}else if(!m(b.queryKey,g))return!1}if("all"!==c){let a=b.isActive();if("active"===c&&!a||"inactive"===c&&a)return!1}return("boolean"!=typeof h||b.isStale()===h)&&(!e||e===b.state.fetchStatus)&&(!f||!!f(b))}function j(a,b){let{exact:c,status:d,predicate:e,mutationKey:f}=a;if(f){if(!b.options.mutationKey)return!1;if(c){if(l(b.options.mutationKey)!==l(f))return!1}else if(!m(b.options.mutationKey,f))return!1}return(!d||b.state.status===d)&&(!e||!!e(b))}function k(a,b){return(b?.queryKeyHashFn||l)(a)}function l(a){return JSON.stringify(a,(a,b)=>q(b)?Object.keys(b).sort().reduce((a,c)=>(a[c]=b[c],a),{}):b)}function m(a,b){return a===b||typeof a==typeof b&&!!a&&!!b&&"object"==typeof a&&"object"==typeof b&&Object.keys(b).every(c=>m(a[c],b[c]))}var n=Object.prototype.hasOwnProperty;function o(a,b){if(!b||Object.keys(a).length!==Object.keys(b).length)return!1;for(let c in a)if(a[c]!==b[c])return!1;return!0}function p(a){return Array.isArray(a)&&a.length===Object.keys(a).length}function q(a){if(!r(a))return!1;let b=a.constructor;if(void 0===b)return!0;let c=b.prototype;return!!r(c)&&!!c.hasOwnProperty("isPrototypeOf")&&Object.getPrototypeOf(a)===Object.prototype}function r(a){return"[object Object]"===Object.prototype.toString.call(a)}function s(a){return new Promise(c=>{b.timeoutManager.setTimeout(c,a)})}function t(a,b,c){return"function"==typeof c.structuralSharing?c.structuralSharing(a,b):!1!==c.structuralSharing?function a(b,c,d=0){if(b===c)return b;if(d>500)return c;let e=p(b)&&p(c);if(!e&&!(q(b)&&q(c)))return c;let f=(e?b:Object.keys(b)).length,g=e?c:Object.keys(c),h=g.length,i=e?Array(h):{},j=0;for(let k=0;k<h;k++){let h=e?k:g[k],l=b[h],m=c[h];if(l===m){i[h]=l,(e?k<f:n.call(b,h))&&j++;continue}if(null===l||null===m||"object"!=typeof l||"object"!=typeof m){i[h]=m;continue}let o=a(l,m,d+1);i[h]=o,o===l&&j++}return f===h&&j===f?b:i}(a,b):b}function u(a,b,c=0){let d=[...a,b];return c&&d.length>c?d.slice(1):d}function v(a,b,c=0){let d=[b,...a];return c&&d.length>c?d.slice(0,-1):d}var w=Symbol();function x(a,b){return!a.queryFn&&b?.initialPromise?()=>b.initialPromise:a.queryFn&&a.queryFn!==w?a.queryFn:()=>Promise.reject(Error(`Missing queryFn: '${a.queryHash}'`))}function y(a,b){return"function"==typeof a?a(...b):!!a}function z(a,b,c){let d,e=!1;return Object.defineProperty(a,"signal",{enumerable:!0,get:()=>(d??=b(),e||(e=!0,d.aborted?c():d.addEventListener("abort",c,{once:!0})),d)}),a}a.s(["addConsumeAwareSignal",()=>z,"addToEnd",()=>u,"addToStart",()=>v,"ensureQueryFn",()=>x,"functionalUpdate",()=>d,"hashKey",()=>l,"hashQueryKeyByOptions",()=>k,"isServer",()=>!0,"isValidTimeout",()=>e,"matchMutation",()=>j,"matchQuery",()=>i,"noop",()=>c,"partialMatchKey",()=>m,"replaceData",()=>t,"resolveEnabled",()=>h,"resolveStaleTime",()=>g,"shallowEqualObjects",()=>o,"shouldThrowError",()=>y,"skipToken",()=>w,"sleep",()=>s,"timeUntilStale",()=>f])},91971,a=>{"use strict";let b,c,d,e,f,g;var h=a.i(63606).systemSetTimeoutZero,i=(b=[],c=0,d=a=>{a()},e=a=>{a()},f=h,{batch:a=>{let g;c++;try{g=a()}finally{let a;--c||(a=b,b=[],a.length&&f(()=>{e(()=>{a.forEach(a=>{d(a)})})}))}return g},batchCalls:a=>(...b)=>{g(()=>{a(...b)})},schedule:g=a=>{c?b.push(a):f(()=>{d(a)})},setNotifyFunction:a=>{d=a},setBatchNotifyFunction:a=>{e=a},setScheduler:a=>{f=a}});a.s(["notifyManager",()=>i])},73367,a=>{"use strict";var b=class{constructor(){this.listeners=new Set,this.subscribe=this.subscribe.bind(this)}subscribe(a){return this.listeners.add(a),this.onSubscribe(),()=>{this.listeners.delete(a),this.onUnsubscribe()}}hasListeners(){return this.listeners.size>0}onSubscribe(){}onUnsubscribe(){}};a.s(["Subscribable",()=>b])},17827,a=>{"use strict";var b=a.i(73367),c=a.i(56487),d=new class extends b.Subscribable{#h;#i;#j;constructor(){super(),this.#j=a=>{if(!c.isServer&&window.addEventListener){let b=()=>a();return window.addEventListener("visibilitychange",b,!1),()=>{window.removeEventListener("visibilitychange",b)}}}}onSubscribe(){this.#i||this.setEventListener(this.#j)}onUnsubscribe(){this.hasListeners()||(this.#i?.(),this.#i=void 0)}setEventListener(a){this.#j=a,this.#i?.(),this.#i=a(a=>{"boolean"==typeof a?this.setFocused(a):this.onFocus()})}setFocused(a){this.#h!==a&&(this.#h=a,this.onFocus())}onFocus(){let a=this.isFocused();this.listeners.forEach(b=>{b(a)})}isFocused(){return"boolean"==typeof this.#h?this.#h:globalThis.document?.visibilityState!=="hidden"}};a.s(["focusManager",()=>d])},70847,6878,51390,a=>{"use strict";var b=a.i(17827),c=a.i(73367),d=a.i(56487),e=new class extends c.Subscribable{#k=!0;#i;#j;constructor(){super(),this.#j=a=>{if(!d.isServer&&window.addEventListener){let b=()=>a(!0),c=()=>a(!1);return window.addEventListener("online",b,!1),window.addEventListener("offline",c,!1),()=>{window.removeEventListener("online",b),window.removeEventListener("offline",c)}}}}onSubscribe(){this.#i||this.setEventListener(this.#j)}onUnsubscribe(){this.hasListeners()||(this.#i?.(),this.#i=void 0)}setEventListener(a){this.#j=a,this.#i?.(),this.#i=a(this.setOnline.bind(this))}setOnline(a){this.#k!==a&&(this.#k=a,this.listeners.forEach(b=>{b(a)}))}isOnline(){return this.#k}};function f(){let a,b,c=new Promise((c,d)=>{a=c,b=d});function d(a){Object.assign(c,a),delete c.resolve,delete c.reject}return c.status="pending",c.catch(()=>{}),c.resolve=b=>{d({status:"fulfilled",value:b}),a(b)},c.reject=a=>{d({status:"rejected",reason:a}),b(a)},c}function g(a){return Math.min(1e3*2**a,3e4)}function h(a){return(a??"online")!=="online"||e.isOnline()}a.s(["onlineManager",()=>e],6878),a.s(["pendingThenable",()=>f],51390);var i=class extends Error{constructor(a){super("CancelledError"),this.revert=a?.revert,this.silent=a?.silent}};function j(a){let c,j=!1,k=0,l=f(),m=()=>b.focusManager.isFocused()&&("always"===a.networkMode||e.isOnline())&&a.canRun(),n=()=>h(a.networkMode)&&a.canRun(),o=a=>{"pending"===l.status&&(c?.(),l.resolve(a))},p=a=>{"pending"===l.status&&(c?.(),l.reject(a))},q=()=>new Promise(b=>{c=a=>{("pending"!==l.status||m())&&b(a)},a.onPause?.()}).then(()=>{c=void 0,"pending"===l.status&&a.onContinue?.()}),r=()=>{let b;if("pending"!==l.status)return;let c=0===k?a.initialPromise:void 0;try{b=c??a.fn()}catch(a){b=Promise.reject(a)}Promise.resolve(b).then(o).catch(b=>{if("pending"!==l.status)return;let c=a.retry??3*!d.isServer,e=a.retryDelay??g,f="function"==typeof e?e(k,b):e,h=!0===c||"number"==typeof c&&k<c||"function"==typeof c&&c(k,b);j||!h?p(b):(k++,a.onFail?.(k,b),(0,d.sleep)(f).then(()=>m()?void 0:q()).then(()=>{j?p(b):r()}))})};return{promise:l,status:()=>l.status,cancel:b=>{if("pending"===l.status){let c=new i(b);p(c),a.onCancel?.(c)}},continue:()=>(c?.(),l),cancelRetry:()=>{j=!0},continueRetry:()=>{j=!1},canStart:n,start:()=>(n()?r():q().then(r),l)}}a.s(["CancelledError",()=>i,"canFetch",()=>h,"createRetryer",()=>j],70847)},46591,a=>{"use strict";var b=a.i(63606),c=a.i(56487),d=class{#l;destroy(){this.clearGcTimeout()}scheduleGc(){this.clearGcTimeout(),(0,c.isValidTimeout)(this.gcTime)&&(this.#l=b.timeoutManager.setTimeout(()=>{this.optionalRemove()},this.gcTime))}updateGcTime(a){this.gcTime=Math.max(this.gcTime||0,a??(c.isServer?1/0:3e5))}clearGcTimeout(){this.#l&&(b.timeoutManager.clearTimeout(this.#l),this.#l=void 0)}};a.s(["Removable",()=>d])},98614,a=>{"use strict";var b=a.i(65893),c=a.i(59297),d=b.createContext(void 0),e=a=>{let c=b.useContext(d);if(a)return a;if(!c)throw Error("No QueryClient set, use QueryClientProvider to set one");return c},f=({client:a,children:e})=>(b.useEffect(()=>(a.mount(),()=>{a.unmount()}),[a]),(0,c.jsx)(d.Provider,{value:a,children:e}));a.s(["QueryClientProvider",()=>f,"useQueryClient",()=>e])}];

//# sourceMappingURL=supplier-portal_55d496db._.js.map