// Where the floor is.
//
// The overlay's own window.screen is unreliable at non-100% DPI (it mixes
// physical and logical pixels), which lands the pet mid-screen. Electron's
// screen API reports display bounds and the work area in DIP, matching the
// window's innerHeight, so main computes the insets and sends them over.

/**
 * @param {{x:number,y:number,width:number,height:number}} b   display bounds
 * @param {{x:number,y:number,width:number,height:number}} wa  work area (bounds minus taskbar/Dock)
 */
function floorGeometry(b, wa) {
  // 0 = no bottom taskbar (top/side/auto-hide): the overlay rests at the true bottom.
  const bottomInset = Math.max(0, (b.y + b.height) - (wa.y + wa.height));
  const topInset = Math.max(0, wa.y - b.y);
  const leftInset = Math.max(0, wa.x - b.x);
  const rightInset = Math.max(0, (b.x + b.width) - (wa.x + wa.width));
  // The floor line: the work-area bottom (top edge of the taskbar/Dock) measured
  // from the window's TOP edge, since the overlay is pinned to the display's
  // top-left. This is authoritative whether or not the OS lets the overlay cover
  // the taskbar: on Windows the overlay is clamped to the work area, so its own
  // innerHeight already excludes the taskbar, and subtracting bottomInset again
  // would float the pet. An absolute line avoids that double count.
  const bottomWorkY = (wa.y + wa.height) - b.y;
  return { bottomInset, topInset, leftInset, rightInset, bottomWorkY };
}

module.exports = { floorGeometry };
