import {isoCode} from "./core/util.js";

/* 국기 이모지 지원 감지 (윈도우는 글자 2개로 렌더링됨).
   웹폰트가 로드되기 전에는 아직 false로 나오므로 로드 후 아래에서 다시 판정한다. */
export const FLAG_FONT='"Twemoji Country Flags","Segoe UI Emoji","Apple Color Emoji",sans-serif';
export function detectFlagOK(){try{
 const c=document.createElement("canvas");c.width=c.height=24;
 const x=c.getContext("2d");x.font='20px '+FLAG_FONT;
 x.fillText("🇰🇷",0,20);
 const d=x.getImageData(0,0,24,24).data;
 for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2],a=d[i+3];
  if(a>10&&(Math.abs(r-g)>16||Math.abs(g-b)>16))return true;}
 return false;
}catch(e){return true;}}
export let flagOK=detectFlagOK();
export function flagHTML(c){return flagOK?c.flag:'<span class="code-flag">'+isoCode(c.flag)+"</span>";}

/* 웹폰트는 늦게 도착한다. 로드된 뒤 다시 판정해서 값이 바뀌면 true를 돌려주고,
   호출한 쪽이 이미 그려 둔 것을 다시 그린다(flagOK는 live binding이라 import한 쪽에도 반영된다). */
export function refreshFlagOK(){
 const v=detectFlagOK();
 if(v===flagOK)return false;
 flagOK=v;return true;
}
