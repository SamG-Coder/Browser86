// Decimal rounding from the exact binary64 ratio; avoids host toFixed's tie rule.
export function formatFloat(value,type,precision,alternate=false){
  const negative=value<0||Object.is(value,-0),sign=negative?'-':'',kind=type.toLowerCase();
  if(!Number.isFinite(value)){const text=sign+(Number.isNaN(value)?'nan':'inf');return type===type.toUpperCase()?text.toUpperCase():text;}
  const bytes=new DataView(new ArrayBuffer(8));bytes.setFloat64(0,Math.abs(value),true);const bits=bytes.getBigUint64(0,true),exponent=Number((bits>>52n)&2047n),mantissa=bits&((1n<<52n)-1n);
  let numerator=exponent?mantissa|(1n<<52n):mantissa,denominator=1n;const power=(exponent?exponent-1023:-1022)-52;if(power>=0)numerator<<=BigInt(power);else denominator<<=BigInt(-power);
  const round=places=>{const n=places>=0?numerator*10n**BigInt(places):numerator,d=places>=0?denominator:denominator*10n**BigInt(-places),q=n/d,r=n%d;return q+(r*2n>d||r*2n===d&&q%2n?1n:0n);};
  const comparePower=e=>e>=0?numerator-denominator*10n**BigInt(e):numerator*10n**BigInt(-e)-denominator;
  let e=value===0?0:Math.floor(Math.log10(Math.abs(value)));if(value!==0){while(comparePower(e)<0)e--;while(comparePower(e+1)>=0)e++;}
  const fixed=places=>{let digits=round(places).toString().padStart(places+1,'0');return places?digits.slice(0,-places)+'.'+digits.slice(-places):digits+(alternate?'.':'');};
  const scientific=(places,digits)=>{const text=digits[0]+(places||alternate?'.'+digits.slice(1).padEnd(places,'0'):'');return text+'e'+(e<0?'-':'+')+String(Math.abs(e)).padStart(2,'0');};
  let text;
  if(kind==='f')text=fixed(precision);
  else {const significant=kind==='e'?precision+1:Math.max(1,precision);let digits=round(significant-1-e).toString().padStart(significant,'0');if(digits.length>significant){e++;digits=digits.slice(0,significant);}
    if(kind==='e')text=scientific(precision,digits);
    else {text=e<-4||e>=significant?scientific(significant-1,digits):fixed(Math.max(0,significant-1-e));if(!alternate){const parts=text.split('e');if(parts[0].includes('.'))parts[0]=parts[0].replace(/0+$/,'').replace(/\.$/,'');text=parts.join('e');}}
  }
  text=sign+text;return type===type.toUpperCase()?text.toUpperCase():text;
}
