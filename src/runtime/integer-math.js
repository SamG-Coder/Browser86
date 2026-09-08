export function mulDiv(number,numerator,denominator){
  number|=0;numerator|=0;denominator|=0;
  if(!denominator)return -1;
  if(!number||!numerator)return 0;
  // Native MulDiv's signed magnitude conversion rejects nonzero products
  // involving INT_MIN, even when the mathematical quotient would fit.
  if(number===-2147483648||numerator===-2147483648)return -1;
  const product=BigInt(number)*BigInt(numerator),divisor=BigInt(denominator);
  const negative=(product<0n)!==(divisor<0n),magnitude=product<0n?-product:product,den=divisor<0n?-divisor:divisor;
  const rounded=(magnitude+den/2n)/den;
  if(rounded>2147483647n)return -1;
  return Number(negative?-rounded:rounded);
}
