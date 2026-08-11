// ---------------------------------- //
// ------- FUNCTION TOOLKIT --------- //
// ---------------------------------- //


// Are 2 elements overlapping
function isOverlap(idOne,idTwo){
	var objOne=idOne,
		objTwo=idTwo,
		offsetOne = objOne.offset(),
		offsetTwo = objTwo.offset(),
		topOne=offsetOne.top,
		topTwo=offsetTwo.top,
		leftOne=offsetOne.left,
		leftTwo=offsetTwo.left,
		widthOne = objOne.width(),
		widthTwo = objTwo.width(),
		heightOne = objOne.height(),
		heightTwo = objTwo.height();

	var leftTop = leftTwo > leftOne && leftTwo < leftOne+widthOne
		&& topTwo > topOne && topTwo < topOne+heightOne,
		rightTop = leftTwo+widthTwo > leftOne && leftTwo+widthTwo < leftOne+widthOne
		&& topTwo > topOne && topTwo < topOne+heightOne,
		leftBottom = leftTwo > leftOne && leftTwo < leftOne+widthOne
		&& topTwo+heightTwo > topOne && topTwo+heightTwo < topOne+heightOne,
		rightBottom = leftTwo+widthTwo > leftOne && leftTwo+widthTwo < leftOne+widthOne
		&& topTwo+heightTwo > topOne && topTwo+heightTwo < topOne+heightOne;

	return leftTop || rightTop || leftBottom || rightBottom;
}




// Is this a touch screen device?
function isTouch() {
	if ("ontouchstart" in document.documentElement){
        return true;
    } else {
         return false;
    }
}
