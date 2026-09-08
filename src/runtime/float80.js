// Storage conversion only: the interpreter's arithmetic registers remain binary64.
export function encodeFloat80(value){
  const raw=new DataView(new ArrayBuffer(8));raw.setFloat64(0,value,true);const bits=raw.getBigUint64(0,true),sign=Number(bits>>63n),field=Number((bits>>52n)&2047n);let significand=bits&((1n<<52n)-1n),exponent=0;
  if(field===2047){exponent=0x7fff;significand=(1n<<63n)|(significand<<11n);}
  else if(field||significand){exponent=field?field-1023:-1022;if(field)significand|=1n<<52n;else while(significand<(1n<<52n)){significand<<=1n;exponent--;}significand<<=11n;exponent+=16383;}
  const bytes=new Uint8Array(10),view=new DataView(bytes.buffer);view.setBigUint64(0,significand,true);view.setUint16(8,(sign<<15)|exponent,true);return bytes;
}
export function decodeFloat80(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,10),word=view.getUint16(8,true),sign=word&0x8000?-1:1,exponent=word&0x7fff,significand=view.getBigUint64(0,true);
  if(exponent===0x7fff)return significand===(1n<<63n)?sign*Infinity:NaN;
  if(!significand)return sign<0?-0:0;
  const fraction=Number(significand)/2**63,power=(exponent||1)-16383;
  return sign*(power< -1022?(fraction*2**-1022)*2**(power+1022):fraction*2**power);
}
