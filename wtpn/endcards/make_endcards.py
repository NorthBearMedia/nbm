"""End cards (rebuilt 15 Aug; endcard.mp4 + serif.ttf were lost with the container).
Needs a serif TTF at FONT below. Render, EYEBALL, then build endcard.mp4 per the bible:
2.7s+2.7s stills, 0.4s xfade at 2.3, fade-out, grain+vignette, 5.0s silent-audio mp4."""
from PIL import Image, ImageDraw, ImageFont
FONT="/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"
W,H=1080,1920
def card(lines,out):
    im=Image.new("RGB",(W,H),(8,8,11)); d=ImageDraw.Draw(im)
    total=sum(sz+gap for _,sz,gap,_ in lines)-lines[-1][2]; y=(H-total)//2
    for txt,sz,gap,col in lines:
        f=ImageFont.truetype(FONT,sz); w=d.textlength(txt,font=f)
        d.text(((W-w)//2,y),txt,font=f,fill=col); y+=sz+gap
    im.save(out); print("wrote",out)
card([("Send this to someone.",86,34,(235,235,238)),
      ("Keep them up tonight.",66,0,(160,160,170))],"endcard1.png")
card([("W H E R E   T H E   P A T H   N A R R O W S",34,70,(120,120,130)),
      ("Daily real ghost stories",76,24,(235,235,238)),
      ("from the UK & Ireland.",76,66,(235,235,238)),
      ("Follow for more.",64,0,(126,182,158))],"endcard2.png")
