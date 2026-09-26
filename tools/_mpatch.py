p='/home/lex/chargebay/src/main.js'
t=open(p).read()
old="""const mirror = new Reflector(new THREE.PlaneGeometry(46,34), {
  clipBias: 0.004, textureWidth: (navigator.hardwareConcurrency>6?2048:1024), textureHeight: (navigator.hardwareConcurrency>6?2048:1024), color: 0x4a4239
});"""
assert t.count(old)==1, t.count(old)
new="""const DenoiseReflectorShader = {
  name:'ReflectorDenoise',
  uniforms:{ color:{value:null}, tDiffuse:{value:null}, textureMatrix:{value:null}, uWet:{value:0.0}, uTime:{value:0.0} },
  vertexShader: [
    'uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWPos;',
    '#include <common>',
    'void main(){ vUv=textureMatrix*vec4(position,1.0); vWPos=(modelMatrix*vec4(position,1.0)).xyz;',
    'gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }'].join('
'),
  fragmentShader: [
    'uniform vec3 color; uniform sampler2D tDiffuse; uniform float uWet; uniform float uTime;',
    'varying vec4 vUv; varying vec3 vWPos;',
    '#include <common>',
    'float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float blendO(float b,float l){return b<0.5?(2.0*b*l):(1.0-2.0*(1.0-b)*(1.0-l));}',
    'vec3 blendO3(vec3 b,vec3 l){return vec3(blendO(b.r,l.r),blendO(b.g,l.g),blendO(b.b,l.b));}',
    'void main(){',
    '  vec2 uv=vUv.xy/vUv.w;',
    '  float pn=h21(floor(uv*vec2(640.0,480.0)));',
    '  uv+=(pn-0.5)*(0.0006+0.0022*uWet);',                 // micro-jitter kills banding
    '  uv.x+=0.0012*sin(uv.y*24.0+uTime*0.9)*uWet;',        // wet shimmer waves
    '  uv.y+=0.0010*cos(uv.x*19.0-uTime*0.7)*uWet;',
    '  vec4 base=texture2D(tDiffuse, clamp(uv,0.0,1.0));',
    '  vec3 refl=blendO3(base.rgb,color);',
    '  float rad=length((vWPos.xz-vec2(0.0,1.5))/vec2(22.0,16.0));',
    '  float vig=1.0-smoothstep(0.30,0.95,rad);',           // reflections strongest at lot center
    '  float rough=mix(0.85,0.42,uWet)*(0.88+0.12*pn);',    // dry = rough/muted, wet = sharp
    '  float amt=vig*rough;',
    '  vec3 asphalt=vec3(0.093,0.082,0.071);',
    '  refl+=(pn-0.5)/220.0;',                               // dither
    '  gl_FragColor=vec4(mix(asphalt,refl,clamp(amt,0.0,1.0)),1.0); }'].join('
')
};
const mirror = new Reflector(new THREE.PlaneGeometry(46,34), {
  clipBias: 0.004, textureWidth: (navigator.hardwareConcurrency>6?2048:1024), textureHeight: (navigator.hardwareConcurrency>6?2048:1024), color: 0x4a4239, shader: DenoiseReflectorShader
});"""
t=t.replace(old,new)
open(p,'w').write(t)
print('patched reflector shader')
