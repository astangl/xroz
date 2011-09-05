// xroz - play crosswords within your browser
// Author: Alex Stangl  8/14/2011
// Copyright 2011, Alex Stangl. All Rights Reserved.
// Licensed under ISC license (see LICENSE file)

//TODO get feedback from users, esp. about keyboard shortcuts & suggestions for improvement
//TODO Support selecting/reading PUZ files from local filesystem
//TODO handle shift or ctrl-arrow to jump by word
//TODO implement backspace
//TODO consider switching to NSEW direction and showing a light arrow in cursor cell
//TODO if browser doesn't support canvas, possibly fallback to using a table
//TODO handle hovering over clues/squares causing light highlight/cursor response
//TODO tweak multicolumn layout to improve look
//TODO figure out whether using canvas is even a good idea (e.g., versus a table)
//TODO handle rebuses
//TODO consider switching to module paradigm
//TODO Improve look of help
//
/*jslint browser: true, bitwise: true, plusplus: true */
var ActiveXObject, parsedPuz, filecontents, PUZAPP = {};
(function () {
	"use strict";

	// return whether browser supports local storage
	function supportsLocalStorage() {
		try {
			return window.localStorage !== undefined && window.localStorage !== null;
		} catch (e) {
			return false;
		}
	}

	// return new child element of specified type, appended to parent
	function appendChild(parentElement, elementType) { 
		return parentElement.appendChild(document.createElement(elementType));
	}

	// append text to specified element, optionally including a <br/> before it
	function appendText(text, element, includeBreakBefore) {
		if (includeBreakBefore) {
			appendChild(element, "br");
		}
		element.appendChild(document.createTextNode(text));
	}

	// remove all children from specified DOM element
	function removeChildren(element) {
		while (element.hasChildNodes()) {
			element.removeChild(element.firstChild);
		}
	}

	// get a binary byte from a string (bytes) at position offset
	function getByte(bytes, offset) {
		return bytes.charCodeAt(offset) % 256;
	}

	// pop items from end of array adding them to accumulator until either
	// array exhausted or next element from array would cause accumulator to exceed threshold
	// returns accumulator. arr is destructively modified, reflecting all the pops.
	function popWhileLessThanOrEqual(threshold, arr) {
		var acc = 0, l;
		for (l = arr.length - 1; l >= 0 && arr[l] + acc <= threshold; --l) {
			acc += arr.pop();
		}
		return acc;
	}

	// return sum of all numbers in array
	function sumArray(arr) {
		var acc = 0, i;
		for (i = 0; i < arr.length; ++i) {
			acc += arr[i];
		}
		return acc;
	}

	// return index of first occurrence of specified element in array, or -1 if not found
	function findInArray(arr, element) {
		var i;
		for (i = 0; i < arr.length; ++i) {
			if (arr[i] === element) {
				return i;
			}
		}
		return -1;
	}

	function Puz() {
		// define symbolic constants
		this.DIRECTION_ACROSS = 1;
		this.DIRECTION_DOWN = -1;
		this.DIRECTION_UNKNOWN = 0;
		/*
		this.DIRECTION_NORTH = 1;
		this.DIRECTION_SOUTH = -1;
		this.DIRECTION_EAST = 2;
		this.DIRECTION_WEST = -2;
		*/

		// event handling strategies
		this.SAVESTATE_AND_BLOCK_EVENT = 1;
		this.PROPAGATE_EVENT = 2;
		this.BLOCK_EVENT = 3;

		this.MIN_CLUE_COLUMN_GUTTER_WIDTH = 10;
		this.MIN_CLUE_COLUMN_WIDTH = 60;
		this.MAX_CLUE_COLUMN_WIDTH = 300;
		this.BODY_MARGIN = 8;		// pixels margin around body

		// names of (mutable) properties that are saved to local storage as the state
		this.STATE_PROPERTIES = ["cursorX", "cursorY", "grid", "pixmult", "direction", "revealSolution",
			"highlightWordNbr", "direction", "highlightWordExtent", "highlightClueId", "lastClickX", "lastClickY"];

		// immutable fields (unchanged after initialization): CONSTANTS, solution, url,
		//      supportsLocalStorage, width, height, gext, acrossWordNbrs, downWordNbrs,
		//      padding (for now), sqNbrs, strings, canv, minPixmult
		//      version, nbrClues, acrossClues, downClues, leftContainer, rightContainer
		//      acrossSqNbrs, downSqNbrs
		// mutable fields: cursorX, cursorY, grid, pixmult, direction, revealSolution,
		//      highlightWordNbr, showingHelp,
		//      direction, highlightWordExtent, highlightClueId, lastClickX, lastClickY

		// return key for putting state into local storage
		this.storageKey = function () {
			return "xroz." + this.url + ".state";
		};

		// save mutable state to local storage, if possible
		// assume if canvas & local storage supported, then JSON is too
		// NOTE: localStorage[] syntax doesn't seem to work w/ Chrome
		this.saveState = function () {
			var i, propName, state = {};
			if (this.supportsLocalStorage) {
				for (i = 0; i < this.STATE_PROPERTIES.length; ++i) {
					propName = this.STATE_PROPERTIES[i];
					state[propName] = this[propName];
				}
				window.localStorage.setItem(this.storageKey(), JSON.stringify(state));
			}
		};

		// restore mutable state from local storage, if possible
		// assume if canvas & local storage supported, then JSON is too
		this.restoreState = function () {
			var i, state, parsed, propName;
			if (this.supportsLocalStorage) {
				state = window.localStorage.getItem(this.storageKey());
				if (state !== null) {
					parsed = JSON.parse(state);
					for (i = 0; i < this.STATE_PROPERTIES.length; ++i) {
						propName = this.STATE_PROPERTIES[i];
						if (parsed.hasOwnProperty(propName)) {
							this[propName] = parsed[propName];
						}
					}
				}
			}
		};
		this.innerHeight = function () {
			return document.getElementsByTagName("html")[0].clientHeight - this.BODY_MARGIN * 2;
		};
		this.innerWidth = function () {
			return document.getElementsByTagName("html")[0].clientWidth - this.BODY_MARGIN * 2;
		};
		this.toIndex = function (x, y) {
			return y * this.width + x;
		};
		this.fromIndex = function (index) {
			return [index % this.width, Math.floor(index / this.width)];
		};
		this.isBlack = function (x, y) {
			return this.solution.charAt(this.toIndex(x, y)) === '.';
		};
		this.cursorBlack = function () {
			return this.isBlack(this.cursorX, this.cursorY);
		};
		this.circled = function (index) {
			return this.gext !== undefined && (getByte(this.gext, index) & 0x80) !== 0;
		};
		this.startDownWord = function (x, y) {
			return (y === 0 || this.isBlack(x, y - 1)) && y < this.height - 1 && !this.isBlack(x, y) && !this.isBlack(x, y + 1);
		};
		this.startAcrossWord = function (x, y) {
			return (x === 0 || this.isBlack(x - 1, y)) && x < this.width - 1 && !this.isBlack(x, y) && !this.isBlack(x + 1, y);
		};
		this.zoomIn = function () {
			this.pixmult++;
			this.onresize();
			//this.drawCanvas();
		};
		this.zoomOut = function () {
			if (this.pixmult > this.minPixmult) {
				this.pixmult--;
				this.onresize();
				//this.drawCanvas();
			}
		};

		// return word associated with (x,y) based upon current direction, or 0 if N/A
		this.getWordNbr = function (x, y) {
			var direction = this.direction,
				index = this.toIndex(x, y);
			if (direction === this.DIRECTION_UNKNOWN) {
				return 0;
			}
			return direction === this.DIRECTION_ACROSS ? this.acrossWordNbrs[index] : this.downWordNbrs[index];
		};

		// redraw specified cell contents
		this.fillCell = function (x, y, ctx) {
			var pixmult = this.pixmult,
				pad = this.padding,
				index = this.toIndex(x, y),
				radius = (pixmult - 1) / 2,
				black = this.isBlack(x, y),
				wordNbr = this.getWordNbr(x, y);
			ctx.beginPath();
			if (this.revealSolution) {
				ctx.fillStyle = black ? "#000000" : this.solution[index] === this.grid[index] ? "#66ff66" : "#ff6666";
			} else if (this.cursorX === x && this.cursorY === y) {
				ctx.fillStyle = black ? "#444400" : "#aaffaa";
			} else if (wordNbr !== 0 && this.highlightWordNbr === wordNbr) {
				ctx.fillStyle = "#ffffaa";
			} else {
				ctx.fillStyle = black ? "#000000" : "#ffffff";
			}
			ctx.fillRect(x * pixmult + pad + 1, y * pixmult + pad + 1, pixmult - 1, pixmult - 1);
			if (!black) {
				ctx.fillStyle = "#000000";
				ctx.font = (pixmult / 3).toString() + "px sans-serif";
				ctx.textBaseline = "top";
				ctx.textAlign = "left";
				ctx.fillText(this.sqNbrs[index], x * pixmult + pad + 2, y * pixmult + pad);
				if (this.revealSolution) {
					ctx.font = (pixmult).toString() + "px sans-serif";
					ctx.textBaseline = "top";
					ctx.textAlign = "center";
					if (this.grid.charAt(index) !== '-') {
						ctx.fillStyle = "#888888";
						ctx.fillText(this.grid.charAt(index), (x + 0.5) * pixmult + pad, y * pixmult + pad);
					}
					ctx.fillStyle = "#000000";
					ctx.fillText(this.solution.charAt(index), (x + 0.5) * pixmult + pad, y * pixmult + pad);
				} else if (this.grid.charAt(index) !== '-') {
					ctx.font = (pixmult).toString() + "px sans-serif";
					ctx.textBaseline = "top";
					ctx.textAlign = "center";
					ctx.fillText(this.grid.charAt(index), (x + 0.5) * pixmult + pad, y * pixmult + pad);
				}
				if (this.circled(index)) {
					ctx.beginPath();
					ctx.arc(x * pixmult + pad + 1 + radius, y * pixmult + pad + 1 + radius,
						radius, 0, Math.PI * 2, true);
					ctx.closePath();
					ctx.strokeStyle = "#777777";
					ctx.stroke();
				}
			}
		};

		// Attempt to optimize layout by squeezing all clues onto screen, if possible, else minimize
		// scrolling necessary. If able to squeeze all on screen, center content nice & evenly.
		// First find optimal column width by trying all widths from min to max & find which
		// width results in most extra horizontal space, if able to fit it all on the screen,
		// or else width which results in least amount of extra height (scrolling)
		// Technically we should compute twice, with & w/o vertical scrollbar, but we shouldn't
		// be squeezing it in so tight that that really matters, so we will always assume space
		// for scrollbar.
		this.optimizeLayout = function () {
			var i, j, colWidth, bestWidth = 150, fitsWithoutOverflow = false, heights, extraWidth,
				bestExtraWidth = 0, overflowY, bestOverflowY = 2E38, nbrLeftCols, nbrRightCols,
				bestNbrLeftCols, bestNbrRightCols, heightMult, newCol,
				canvHeight = this.canv.height, canvWidth = this.canv.width, leftmostCol, cutoffPoint,
				colGutter = this.MIN_CLUE_COLUMN_GUTTER_WIDTH,
				leftHeight = this.innerHeight(), rightHeight = leftHeight, innerWidth = this.innerWidth(),
				colsToRemove, leftColHeight, rightColHeight;
			if (innerWidth <= canvWidth) {
				// screen is too narrow, so don't bother trying fancy layout
				return;
			}
			// set left container wide first so we can get accurate height for first row
			this.leftContainer.style.width = (innerWidth - this.canv.width) + "px";
			leftHeight -= this.leftContainer.firstChild.offsetHeight;
			this.leftContainer.style.overflow = "hidden";
			leftColHeight = Math.max(leftHeight, canvHeight);
			rightColHeight = Math.max(rightHeight - canvHeight, 0);
			for (i = this.MIN_CLUE_COLUMN_WIDTH; i <= this.MAX_CLUE_COLUMN_WIDTH; i += 5) {
				this.leftContainer.style.width = i + "px";
				colWidth = i;
				if (this.leftContainer.scrollWidth === i) {
					// First compute max # of columns we can squeeze into left & right, and leftover extraWidth
					nbrRightCols = canvWidth < colWidth ? 0 : Math.floor((canvWidth - colWidth) / (colWidth + colGutter)) + 1;
					nbrLeftCols = Math.floor((innerWidth - canvWidth) / (colWidth + colGutter));
					extraWidth = (innerWidth - canvWidth) - nbrLeftCols * (colWidth + colGutter);

					// Next store array of heights of each clue row, at our current colWidth
					heights = [];
					for (j = 1; j < this.leftContainer.childNodes.length; ++j) {
						heights.push(this.leftContainer.childNodes[j].offsetHeight);
					}
					// try to fill right columns first, then left
					colsToRemove = 0;
					for (j = 0; j < nbrRightCols; ++j) {
						if (heights.length === 0) {
							colsToRemove++;
						} else {
							popWhileLessThanOrEqual(rightColHeight, heights);
						}
					}
					nbrRightCols -= colsToRemove;
					colsToRemove = 0;
					for (j = 0; j < nbrLeftCols; ++j) {
						if (heights.length === 0) {
							extraWidth += colWidth + this.MIN_CLUE_COLUMN_GUTTER_WIDTH;
							colsToRemove++;
						} else {
							popWhileLessThanOrEqual(leftColHeight, heights);
						}
					}
					nbrLeftCols -= colsToRemove;
					// anything left in heights is overflow;
					// on the other hand, we may have underflow; one or more columns may not be full
					if (heights.length === 0) {
						if (!fitsWithoutOverflow || extraWidth > bestExtraWidth) {
							bestWidth = colWidth;
							bestExtraWidth = extraWidth;
							bestNbrLeftCols = nbrLeftCols;
							bestNbrRightCols = nbrRightCols;
						}
						fitsWithoutOverflow = true;
					} else if (!fitsWithoutOverflow) {
						// normalize overflow by dividing by total # of columns, rounding up
						overflowY = Math.ceil(sumArray(heights) / (nbrLeftCols + nbrRightCols));
						if (overflowY < bestOverflowY) {
							bestOverflowY = overflowY;
							bestWidth = colWidth;
							bestNbrLeftCols = nbrLeftCols;
							bestNbrRightCols = nbrRightCols;
						}
					}
				}
			}
			if (!fitsWithoutOverflow) {
				leftColHeight += bestOverflowY;
				rightColHeight += bestOverflowY;
			}
			i = Math.floor(bestExtraWidth / 2);
			this.leftContainer.style.marginLeft = i + "px";
			this.leftContainer.style.width = (innerWidth - this.canv.width - bestExtraWidth) + "px";
			leftmostCol = document.createElement("div");
			leftmostCol.style.marginRight = this.MIN_CLUE_COLUMN_GUTTER_WIDTH + "px";
			leftmostCol.style.cssFloat = "left";
			leftmostCol.style.width = bestWidth + "px";
			this.leftContainer.appendChild(leftmostCol);
			// pour all content from leftContainer into first column, so we have correct sizing to refer to
			while (this.leftContainer.childNodes[1] !== leftmostCol) {
				leftmostCol.appendChild(this.leftContainer.childNodes[1]);
				if (leftmostCol.offsetHeight <= leftColHeight) {
					cutoffPoint = leftmostCol.childNodes.length;   // note cutoff for first column
				}
			}
			// multiplier to use when considering height of next row to add; if exactly filling screen,
			// consider full height of row; otherwise consider half row height to allow some overflow
			heightMult = fitsWithoutOverflow ? 1 : 0.5;
			for (i = 1; i < bestNbrLeftCols; ++i) {
				newCol = document.createElement("div");
				newCol.style.marginRight = this.MIN_CLUE_COLUMN_GUTTER_WIDTH + "px";
				newCol.style.cssFloat = "left";
				newCol.style.width = bestWidth + "px";
				this.leftContainer.appendChild(newCol);
				while (cutoffPoint < leftmostCol.childNodes.length &&
						newCol.offsetHeight + heightMult * leftmostCol.childNodes[cutoffPoint].offsetHeight <= leftColHeight) {
					newCol.appendChild(leftmostCol.childNodes[cutoffPoint]);
				}
			}
			for (i = 0; i < bestNbrRightCols; ++i) {
				newCol = document.createElement("div");
				newCol.style.marginRight = (i === bestNbrRightCols - 1 ? 0 : this.MIN_CLUE_COLUMN_GUTTER_WIDTH) + "px";
				newCol.style.cssFloat = "left";
				newCol.style.width = bestWidth + "px";
				this.rightContainer.appendChild(newCol);
				while (cutoffPoint < leftmostCol.childNodes.length &&
						(newCol.offsetHeight + heightMult * leftmostCol.childNodes[cutoffPoint].offsetHeight <= rightColHeight
						|| i === bestNbrRightCols - 1)) {
					newCol.appendChild(leftmostCol.childNodes[cutoffPoint]);
				}
			}
		};

		// add set of clues to DOM left container
		this.addCluesToDOM = function (clues, idPrefix) {
			var leftContainer = this.leftContainer, i, row, dv;
			for (i = 0; i < clues.length; i += 2) {
				dv = appendChild(leftContainer, "div");
				dv.style.position = "relative";
				dv.style.fontSize = "10pt";
				row = appendChild(dv, "div");
				row.id = idPrefix + clues[i];
				dv = appendChild(row, "div");
				dv.style.position = "absolute";
				dv.style.left = "-1em";
				dv.style.textAlign = "right";
				dv.style.width = "3em";
				dv.style.fontWeight = "bold";
				dv.appendChild(document.createTextNode(clues[i]));
				dv = appendChild(row, "div");
				dv.style.marginLeft = "2.2em";
				dv.appendChild(document.createTextNode(this.strings[3 + clues[i + 1]]));
			}
		};

		// fill all cell contents
		this.fillAll = function (ctx) {
			var x, y;
			for (y = 0; y < this.height; y++) {
				for (x = 0; x < this.width; x++) {
					this.fillCell(x, y, ctx);
				}
			}
		};

		// reveal the full solution
		this.showSolution = function () {
			this.revealSolution = true;
			this.fillAll(this.canv.getContext("2d"));
		};
		// reveal correct contents for the single cell where the cursor is
		this.showCellSolution = function () {
			var x = this.cursorX,
				y = this.cursorY,
				index = this.toIndex(x, y);
			this.grid = this.grid.substring(0, index) + this.solution.charAt(index) + this.grid.substring(index + 1);
			this.saveState();
			this.fillCell(x, y, this.canv.getContext("2d"));
		};
		this.drawCanvas = function () {
			var canv = this.canv,
				pixmult = this.pixmult,
				pad = this.padding,
				w = pixmult * this.width,
				wpad = w + 2 * pad,
				h = pixmult * this.height,
				hpad = h + 2 * pad,
				ctx = canv.getContext("2d"),
				x,
				y;
			canv.width = wpad + 1;
			canv.height = hpad + 1;

			// fill cell contents
			this.fillAll(ctx);
			
			// draw grid lines
			ctx.beginPath();
			for (x = 0.5; x < w + 1; x += pixmult) {
				ctx.moveTo(x + pad, pad);
				ctx.lineTo(x + pad, h + pad);
			}
			for (y = 0.5; y < h + 1; y += pixmult) {
				ctx.moveTo(pad, y + pad);
				ctx.lineTo(w + pad, y + pad);
			}
			ctx.strokeStyle = "#000000";
			ctx.stroke();

			// draw padding
			ctx.beginPath();
			for (x = 0; x < pad; ++x) {
				ctx.moveTo(0, x + 0.5);
				ctx.lineTo(wpad, x + 0.5);
				ctx.moveTo(0, hpad + 0.5 - x);
				ctx.lineTo(wpad, hpad + 0.5 - x);
				ctx.moveTo(x + 0.5, 0);
				ctx.lineTo(x + 0.5, hpad);
				ctx.moveTo(wpad + 0.5 - x, 0);
				ctx.lineTo(wpad + 0.5 - x, hpad);
			}
			ctx.strokeStyle = "#ffffff";
			ctx.stroke();
		};

		this.drawHelp = function () {
			var dv = document.createElement("div"), body = document.getElementsByTagName("body")[0];
			dv.id = "help";
			dv.style.display = "block";
			dv.style.visibility = "hidden";
			dv.style.borderStyle = "double";
			dv.style.borderColor = "black";
			dv.style.backgroundColor = "white";
			dv.style.borderWidth = "4px";
			dv.style.padding = "10px";
			dv.style.position = "absolute";
			appendText("Arrow keys move cursor.", dv);
			appendText("Letter keys enter letter.", dv, true);
			appendText("Tab moves to next word in current direction.", dv, true);
			appendText("Shift-Tab moves to prev. word in current direction.", dv, true);
			appendText("DEL or _ clears current square.", dv, true);
			appendText("+/- zooms in/out of puzzle grid.", dv, true);
			appendText("? shows help.", dv, true);
			appendText("! reveals complete solution.", dv, true);
			appendText("@ fills current square with correct letter.", dv, true);
			appendText("Ctrl-R clears all cells (resets grid)", dv, true);
			appendText("Mouse click changes cursor position.", dv, true);
			appendText("Mouse click in same cell toggles direction.", dv, true);
			appendText("Space toggles direction.", dv, true);
			body.appendChild(dv);
			dv.style.left = Math.floor((this.innerWidth() - dv.offsetWidth) / 2) + "px";
			dv.style.top = Math.floor((this.innerHeight() - dv.offsetHeight) / 2) + "px";
			this.showingHelp = false;
		};

		this.drawBody = function () {
			var leftContainer = this.leftContainer, dv, dv2;
			// first stick in special first row that will contain info about the puzzle
			dv = appendChild(leftContainer, "div");
			dv.style.textAlign = "center";
			dv.style.fontSize = "150%";
			dv.style.paddingBottom = "10px";
			dv2 = appendChild(dv, "div");
			dv2.style.fontWeight = "bold";
			appendText(this.strings[0], dv2);
			appendText(this.strings[1], dv);
			dv = appendChild(leftContainer, "div");
			dv.style.paddingLeft = "40px";
			appendText("ACROSS", appendChild(dv, "b"));
			this.addCluesToDOM(this.acrossClues, "acrossClue");

			dv = appendChild(leftContainer, "div");
			dv.style.paddingTop = "60px";
			dv.style.paddingLeft = "40px";
			appendText("DOWN", appendChild(dv, "b"));
			this.addCluesToDOM(this.downClues, "downClue");

			this.optimizeLayout();
		};

		this.getWordExtent = function () {
			var direction = this.direction,
				x = this.cursorX,
				y = this.cursorY,
				retval = [];
			if (direction === this.DIRECTION_UNKNOWN || this.isBlack(x, y)) {
				return [];
			}
			if (direction === this.DIRECTION_ACROSS) {
				for (; x >= 0 && !this.isBlack(x, y); --x) {
					retval.push([x, y]);
				}
				for (x = this.cursorX + 1; x < this.width && !this.isBlack(x, y); ++x) {
					retval.push([x, y]);
				}
			} else {
				for (; y >= 0 && !this.isBlack(x, y); --y) {
					retval.push([x, y]);
				}
				for (y = this.cursorY + 1; y < this.height && !this.isBlack(x, y); ++y) {
					retval.push([x, y]);
				}
			}
			return retval;
		};

		// refill cells in highlightWordExtent
		this.refillHighlightExtent = function () {
			var extent, i, p, ctx = this.canv.getContext("2d");
			if (this.highlightWordExtent !== undefined) {
				extent = this.highlightWordExtent;
				for (i = 0; i < extent.length; ++i) {
					p = extent[i];
					this.fillCell(p[0], p[1], ctx);
				}
			}
		};

		// unhighlight currently highlighted word
		this.unhighlightWord = function () {
			if (this.highlightWordExtent !== undefined) {
				this.highlightWordNbr = 0;
				this.refillHighlightExtent();
				delete this.highlightWordExtent;
				document.getElementById(this.highlightClueId).style.backgroundColor = "#ffffff";
				delete this.highlightClueId;
			}
		};

		// highlight word at cursor and corresponding clue, taking direction into account
		this.highlightWord = function () {
			var wordNbr = this.getWordNbr(this.cursorX, this.cursorY), clueId;
			if (wordNbr !== 0) {
				this.highlightWordNbr = wordNbr;
				this.highlightWordExtent = this.getWordExtent();
				this.refillHighlightExtent();
				clueId = this.direction === this.DIRECTION_ACROSS ? "acrossClue" + wordNbr : "downClue" + wordNbr;
				document.getElementById(clueId).style.backgroundColor = "#ffffaa";
				this.highlightClueId = clueId;
			}
		};

		// toggle across/down highlight direction
		this.toggleDirection = function () {
			this.unhighlightWord();
			this.direction = -this.direction;
			this.highlightWord();
		};

		// handle mouse click in a cell
		this.onclick = function (e) {
			var canv = this.canv,
				ctx = canv.getContext("2d"),
				oldx = this.cursorX,
				oldy = this.cursorY,
				cursorX,
				cursorY,
				x,
				y;
			if (e.pageX !== undefined && e.pageY !== undefined) {
				x = e.pageX;
				y = e.pageY;
			} else {
				x = e.clientX + document.body.scrollLeft +
					document.documentElement.scrollLeft;
				y = e.clientY + document.body.scrollTop +
					document.documentElement.scrollTop;
			}
			cursorX = Math.floor((x - canv.offsetLeft) / this.pixmult);
			cursorY = Math.floor((y - canv.offsetTop) / this.pixmult);
			this.cursorX = cursorX;
			this.cursorY = cursorY;
			this.fillCell(oldx, oldy, ctx);
			this.fillCell(cursorX, cursorY, ctx);
			if (cursorX === this.lastClickX && cursorY === this.lastClickY) {
				this.toggleDirection();
			} else {
				this.unhighlightWord();
				this.highlightWord();
			}
			this.lastClickX = cursorX;
			this.lastClickY = cursorY;
			this.saveState();
			// block event propagation
			e.preventDefault();
			return false;
		};

		// move cursor; f = function to keep calling as long as it returns true (should perform increment internally)
		this.cursorMove = function (f) {
			var oldx = this.cursorX, oldy = this.cursorY, ctx = this.canv.getContext("2d"), wordNbr;
			// using apply on next line to be able pass this ptr
			// NOTE: JSLint doesn't like empty block on next line but it seems spurious in this case
			while (f.apply(this) && this.cursorBlack()) {}
			if (this.cursorBlack()) {
				// ended up in a black region and hit edge; revert to prev. position
				this.cursorX = oldx;
				this.cursorY = oldy;
			} else if (oldx !== this.cursorX || oldy !== this.cursorY) {
				wordNbr = this.getWordNbr(this.cursorX, this.cursorY);
				if (wordNbr !== 0 && wordNbr !== this.highlightWordNbr) {
					// moved onto different word; unhighlight old word, highlight new
					this.unhighlightWord();
					this.highlightWord();
				}
				this.fillCell(oldx, oldy, ctx);
				this.fillCell(this.cursorX, this.cursorY, ctx);
			}
		};
		this.moveLeftAndOkToMoveAgain = function () {
			return --this.cursorX > 0;
		};
		this.moveRightAndOkToMoveAgain = function () {
			return ++this.cursorX < this.width - 1;
		};
		this.moveUpAndOkToMoveAgain = function () {
			return --this.cursorY > 0;
		};
		this.moveDownAndOkToMoveAgain = function () {
			return ++this.cursorY < this.height - 1;
		};
		this.cursorLeft = function () {
			if (this.cursorX > 0) {
				this.cursorMove(this.moveLeftAndOkToMoveAgain);
			}
		};
		this.cursorRight = function () {
			if (this.cursorX < this.width - 1) {
				this.cursorMove(this.moveRightAndOkToMoveAgain);
			}
		};
		this.cursorUp = function () {
			if (this.cursorY > 0) {
				this.cursorMove(this.moveUpAndOkToMoveAgain);
			}
		};
		this.cursorDown = function () {
			if (this.cursorY < this.height - 1) {
				this.cursorMove(this.moveDownAndOkToMoveAgain);
			}
		};
		this.clueMove = function (sqNbrs, wordNbrs, inc) {
			var oldx = this.cursorX, oldy = this.cursorY, curWordNbr = this.getWordNbr(oldx, oldy), ctx = this.canv.getContext("2d"), i, newXY;
			i = findInArray(sqNbrs, curWordNbr) + inc;
			if (i >= 0 && i < sqNbrs.length) {
				newXY = this.fromIndex(findInArray(wordNbrs, sqNbrs[i]));
				this.cursorX = newXY[0];
				this.cursorY = newXY[1];
				this.unhighlightWord();
				this.highlightWord();
				this.fillCell(oldx, oldy, ctx);
				this.fillCell(this.cursorX, this.cursorY, ctx);
			}
		};
		this.nextClue = function (inc) {
			if (this.direction === this.DIRECTION_ACROSS) {
				this.clueMove(this.acrossSqNbrs, this.acrossWordNbrs, inc);
			} else if (this.direction === this.DIRECTION_DOWN) {
				this.clueMove(this.downSqNbrs, this.downWordNbrs, inc);
			}
		};
		this.insert = function (charToInsert) {
			var index = this.toIndex(this.cursorX, this.cursorY),
				ctx = this.canv.getContext("2d");
			if (this.grid.charAt(index) !== '.') {
				this.grid = this.grid.substring(0, index) + charToInsert + this.grid.substring(index + 1);
				this.fillCell(this.cursorX, this.cursorY, ctx);
			}
		};
		this.insertAndAdvance = function (charToInsert) {
			var index = this.toIndex(this.cursorX, this.cursorY);
			if (this.grid.charAt(index) !== '.') {
				this.insert(charToInsert);
				if (this.direction === this.DIRECTION_ACROSS) {
					this.cursorRight();
				} else if (this.direction === this.DIRECTION_DOWN) {
					this.cursorDown();
				}
			}
		};

		// add canvas element to rightContainer
		this.addCanvasToRightContainer = function () {
			this.canv = appendChild(appendChild(this.rightContainer, "div"), "canvas");
			appendText("Your browser needs to support HTML5 canvas in order to view this page properly.", this.canv, false);
		};


		// onkeydown event handler
		this.onkeydown = function (e) {
			var kc = e.keyCode;
			if (kc >= 37 && kc <= 40) {
				if (kc === 37) {
					this.cursorLeft();
				} else if (kc === 38) {
					this.cursorUp();
				} else if (kc === 39) {
					this.cursorRight();
				} else if (kc === 40) {
					this.cursorDown();
				}
				this.saveState();
				e.preventDefault();
				// block arrow key event propagation
				return false;
			}
			if (kc === 46) {
				this.insert(" ");
				this.saveState();
				// block delete key event propagation
				e.preventDefault();
				return false;
			}
			if (kc === 9) {
				this.nextClue(e.shiftKey ? -1 : 1);
				// block Tab key event propagation
				e.preventDefault();
				return false;
			}
			return true;
		};

		// display help in a popup
		this.showHelp = function () {
			document.getElementById("help").style.visibility = "visible";
			this.showingHelp = true;
		};

		// hide help
		this.hideHelp = function () {
			document.getElementById("help").style.visibility = "hidden";
			this.showingHelp = false;
		};

		// onkeypress event handler
		this.onkeypressImpl = function (e) {
			var keynum, keychar, charToInsert;
			this.hideHelp();
			if (window.event) { // IE
				keynum = e.keyCode;
			} else if (e.which) { // NS/Firefox/Opera
				keynum = e.which;
			}
			keychar = String.fromCharCode(keynum);
			if (keychar === "+") {
				this.zoomIn();
				return this.SAVESTATE_AND_BLOCK_EVENT;
			} else if (keychar === "-") {
				this.zoomOut();
				return this.SAVESTATE_AND_BLOCK_EVENT;
			} else if (keychar === "?") {
				this.showHelp();
				return this.BLOCK_EVENT;
			} else if (keychar === " ") {
				this.toggleDirection();
				return this.SAVESTATE_AND_BLOCK_EVENT;
			} else if (keychar === "!") {
				this.showSolution();
				return this.SAVESTATE_AND_BLOCK_EVENT;
			} else if (keychar === "@") {
				this.showCellSolution();
				return this.SAVESTATE_AND_BLOCK_EVENT;
			}
			// If Ctrl-R hit, clear all cells and redraw canvas 
			if (e.ctrlKey && keychar.toUpperCase() === "R") {
				//this.grid = this.grid.replace(/[^-]/g, "-");
				this.grid = this.grid.replace(/[A-Z]/g, "-");
				this.drawCanvas();
				return this.SAVESTATE_AND_BLOCK_EVENT;
			}
			if (keychar.match(/[A-Z _\/]/i)) {
				charToInsert = keychar.match(/[_\/]/) ? " " : keychar.toUpperCase();
				this.insertAndAdvance(charToInsert);
				return this.SAVESTATE_AND_BLOCK_EVENT;
			}
			return this.PROPAGATE_EVENT;
		};
		this.onkeypress = function (e) {
			var r = this.onkeypressImpl(e);
			if (r === this.SAVESTATE_AND_BLOCK_EVENT) {
				this.saveState();
			}
			if (r === this.SAVESTATE_AND_BLOCK_EVENT || r === this.BLOCK_EVENT) {
				e.preventDefault();
				return false;
			}
			if (r === this.PROPAGATE_EVENT) {
				return true;
			}
			throw {
				name: "BADEVENTRETURN",
				message: "Unhandled event strategy '" + r + "'."
			};
		};

		// on resize event, redraw screen with potentially new layout
		this.onresize = function () {
			removeChildren(this.leftContainer);
			removeChildren(this.rightContainer);
			this.addCanvasToRightContainer();
			this.drawCanvas();
			this.drawBody();
		};

		this.minPixmult = 22;
		this.pixmult = this.minPixmult;
		this.padding = 5;
		this.cursorX = 0;
		this.cursorY = 0;
		this.direction = this.DIRECTION_ACROSS;
		this.lastClickX = -1;
		this.lastClickY = -1;

		// store flag indicating whether browser supports local storage.
		//TODO this may be a premature optimization; figure out whether caching this is really worthwhile
		this.supportsLocalStorage = supportsLocalStorage();
	}

	function getShort(bytes, offset) {
		return getByte(bytes, offset) + getByte(bytes, offset + 1) * 256;
	}

	function cksum_region(bytes, base, len, cksum) {
		var i;
		for (i = 0; i < len; ++i) {
			if (cksum % 2) {
				cksum = (cksum - 1) / 2 + 0x8000;
			} else {
				cksum /= 2;
			}
			cksum += getByte(bytes, base + i);
		}
		
		return cksum;
	}

	// return offset of nth occurrence of myChar
	function findOffsetOfNth(bytes, startOffset, myChar, n) {
		var offset = startOffset;
		while (n > 0) {
			if (bytes[offset++] === myChar) {
				n--;
			}
		}
		return offset;
	}

	function readContent(url) {
		var xmlhttp = window.XMLHttpRequest ? new XMLHttpRequest() : new ActiveXObject("Microsoft.XMLHTTP");
		xmlhttp.overrideMimeType('text/plain; charset=x-user-defined');
		xmlhttp.open("GET", url, false);
		xmlhttp.send();
		return xmlhttp.responseText;
	}
	function parsePuz(bytes) {
		//TODO check checksums
		var retval = new Puz(),
			filemagic = bytes.substring(2, 14),
			//filechecksum = getShort(bytes, 0),
			c_cib = cksum_region(bytes, 44, 8, 0),
			w = getByte(bytes, 44),
			h = getByte(bytes, 45),
			wh = w * h,
			grid_offset = 52 + wh,
			strings_offset = grid_offset + wh,
			cksum = cksum_region(bytes, 52, wh, c_cib),
			nbrClues = getShort(bytes, 46),
			extra_offset = findOffsetOfNth(bytes, strings_offset, '\u0000', nbrClues + 4),
			offset = extra_offset,
			sqNbr = 1,
			sqNbrString,
			clueNum = 0,
			index = 0,
			acrossClues = [],
			downClues = [],
			sqNbrs = [],
			downWordNbrs = [],
			acrossWordNbrs = [],
			acrossSqNbrs = [],
			downSqNbrs = [],
			sectName,
			len,
			chksum,
			compChksum,
			x,
			y,
			saw,
			sdw,
			isBlack;
		if (filemagic !== "ACROSS&DOWN\u0000") {
			throw {
				name: "BADMAGICNUMBER",
				message: "File did not contain expected magic number, contained '" + filemagic + "'."
			};
		}
		retval.version = bytes.substring(24, 27);
		retval.width = w;
		retval.height = h;
		retval.nbrClues = nbrClues;
		retval.solution = bytes.substring(52, 52 + wh);
		retval.strings = bytes.substring(strings_offset).split('\u0000', nbrClues + 4);
		retval.grid = bytes.substring(grid_offset, grid_offset + wh);
		cksum = cksum_region(bytes, grid_offset, wh, cksum);
		for (y = 0; y < h; y++) {
			for (x = 0; x < w; x++, index++) {
				sdw = retval.startDownWord(x, y);
				saw = retval.startAcrossWord(x, y);
				sqNbrString = sqNbr.toString();
				sqNbrs.push(sdw || saw ? sqNbrString : "");
				isBlack = retval.isBlack(x, y);
				downWordNbrs.push(sdw ? sqNbr : isBlack || y === 0 ? 0 : downWordNbrs[index - w]);
				acrossWordNbrs.push(saw ? sqNbr : isBlack || x === 0 ? 0 : acrossWordNbrs[index - 1]);
				if (sdw || saw) {
					if (saw) {
						acrossClues.push(sqNbr);
						acrossClues.push(clueNum++);
						acrossSqNbrs.push(sqNbr);
					}
					if (sdw) {
						downClues.push(sqNbr);
						downClues.push(clueNum++);
						downSqNbrs.push(sqNbr);
					}
					sqNbr++;
				}
			}
		}
		retval.acrossClues = acrossClues;
		retval.downClues = downClues;
		retval.sqNbrs = sqNbrs;
		retval.acrossWordNbrs = acrossWordNbrs;
		retval.downWordNbrs = downWordNbrs;
		retval.acrossSqNbrs = acrossSqNbrs;
		retval.downSqNbrs = downSqNbrs;
		while (offset < bytes.length) {
			sectName = bytes.substring(offset, offset + 4);
			len = getShort(bytes, offset + 4);
			chksum = getShort(bytes, offset + 6);
			compChksum = cksum_region(bytes, offset + 8, len, 0);
			if (chksum !== compChksum) {
				throw {
					name: "BadExtraSectionChecksum",
					message: "Extra section " + sectName + " had computed checksum " + compChksum + ", versus given checksum " + chksum
				};
			}
			if (sectName === "GEXT") {
				retval.gext = bytes.substring(offset + 8, offset + 8 + len);
			}
			offset += len + 9;
			//alert("Extra section " + sectName);
		}
		return retval;
	}

	function drawPuzzle(puzUrl, puzContainer) {
		var filecontents = readContent(puzUrl),
			parsedPuz = parsePuz(filecontents),
			divl,
			divr,
			body = document.getElementsByTagName("body")[0];
		body.style.borderWidth = parsedPuz.BODY_MARGIN + "px";
		body.style.padding = "0px";
		removeChildren(puzContainer);
		divl = appendChild(puzContainer, "div");
		divr = appendChild(puzContainer, "div");
		divl.style.cssFloat = "left";
		divr.style.cssFloat = "left";
		PUZAPP.puz = parsedPuz;
		parsedPuz.leftContainer = divl;
		parsedPuz.rightContainer = divr;
		parsedPuz.addCanvasToRightContainer();
		parsedPuz.url = puzUrl;
		parsedPuz.restoreState();
		// cursor right then left should leave cursor on first empty square, in case corner is black
		parsedPuz.drawHelp();
		parsedPuz.drawCanvas();
		parsedPuz.drawBody();
		parsedPuz.cursorRight();
		parsedPuz.cursorLeft();
		parsedPuz.highlightWord();
		document.onkeypress = function (e) { return parsedPuz.onkeypress(e); };
		document.onclick = function (e) { return parsedPuz.onclick(e); };
		document.onkeydown = function (e) { return parsedPuz.onkeydown(e); };
		window.onresize = function (e) { return parsedPuz.onresize(e); };
	}

	function drawPuzzleById(puzUrl, puzContainerId) {
		return drawPuzzle(puzUrl, document.getElementById(puzContainerId));
	}

	PUZAPP.drawPuzzle = drawPuzzle;
	PUZAPP.drawPuzzleById = drawPuzzleById;
}());

