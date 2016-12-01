var KEYCODE_ENTER = 13;
var KEYCODE_ESC = 27;

// TODO: figure out why keyup is not available in ext tab document
// TODO: if using jquery keys can be set individually without overwriting the onkeyup Event:
// $(document).keyup(function(e) { if (e.which == KEYCODE_ESC) { cb(); } });
// adds callbacks for ESC and ENTER key presses
function onKeys(cbESC, cbENTER) {
  document.onkeyup = function (e) {
    e = e || window.event;
    switch (e.which || e.keyCode) {
    case KEYCODE_ENTER :
      cbENTER();
      break;
    case KEYCODE_ESC :
      cbESC();
      break;
    }
  }
}
