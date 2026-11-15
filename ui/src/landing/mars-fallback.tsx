import { MARS_TEXTURE_URL } from './textures';

export function MarsFallback() {
  return <div className="editorial-mars-fallback" style={{
    backgroundImage: `radial-gradient(circle at 28% 36%, transparent 0%, rgba(0,0,0,.12) 38%, rgba(8,11,15,.72) 72%, rgba(8,11,15,.96) 100%), url(${MARS_TEXTURE_URL})`
  }} />;
}
