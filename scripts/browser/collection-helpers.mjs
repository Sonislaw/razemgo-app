import {expect} from '@playwright/test';

// Loaded records and mounted rows are deliberately different on a virtual list.
export async function expectLoaded(screen,count){
  const id=await screen.getAttribute('data-testid');
  await expect(screen.getByTestId(id+'-loaded-'+count)).toBeAttached();
}

export async function scrollToRow(screen,row){
  let scanned=false;
  // Move like a user, allowing variable-height rows to be measured along the
  // way. DOM scrollIntoView can jump into an unmeasured spacer and lose its row.
  await expect.poll(async()=>{
    const viewport=await screen.boundingBox(),box=await row.boundingBox({timeout:100}).catch(()=>null);
    if(box&&box.y>=viewport.y-1&&box.y+Math.min(box.height,viewport.height)<=viewport.y+viewport.height+1)return true;
    if(!box&&!scanned){await screen.evaluate(el=>{el.scrollTop=0;});scanned=true;return false;}
    const step=viewport.height*0.7;
    const delta=box?box.y<viewport.y?-Math.min(step,viewport.y-box.y):Math.min(step,box.y+box.height-viewport.y-viewport.height):step;
    await screen.evaluate((el,amount)=>el.scrollBy(0,amount),delta);
    return false;
  },{timeout:20000,intervals:[50,100,150]}).toBe(true);
}
