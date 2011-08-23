// xroz - play crosswords within your browser
// Author: Alex Stangl  8/14/2011
// Copyright 2011, Alex Stangl. All Rights Reserved.
// Licensed under ISC license (see LICENSE file)

//TODO handle shift or ctrl-arrow to jump by word
//TODO handle printing error message if browser doesn't support canvas, or possibly fallback to using a table
//TODO implement DELETE, backspace, Tab, Shift-Tab
//TODO consider switching to NSEW direction and showing a light arrow in cursor cell
//TODO handle hovering over clues/squares causing light highlight/cursor response
//TODO save state
//TODO better looking multi-column clue layout
//TODO figure out whether using canvas is even a good idea (e.g., versus a table)
//TODO handle rebuses
//
/*jslint browser: true, bitwise: true, plusplus: true */
var ActiveXObject, XMLHttpRequest, parsedPuz, filecontents, PUZAPP = {};
(function () {
	"use strict";

	// return new child element of specified type, appended to parent
	function appendChild(parentElement, elementType) { 
		var retval = document.createElement(elementType);
		parentElement.appendChild(retval);
		return retval;
	}

	function appendText(text, textContainer, includeBreakBefore) {
		if (includeBreakBefore) {
			appendChild(textContainer, "br");
		}
		textContainer.appendChild(document.createTextNode(text));
	}

	function appendPara(text, textContainer) {
		var txt = document.createTextNode(text), para = document.createElement("p");
		para.appendChild(txt);
		textContainer.appendChild(para);
	}

	function appendBold(text, textContainer) {
		var txt = document.createTextNode(text), para = document.createElement("p"), bold = appendChild(para, "b");
		bold.appendChild(txt);
		textContainer.appendChild(para);
	}

	function getByte(bytes, offset) {
		return bytes.charCodeAt(offset) % 256;
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

		this.toIndex = function (x, y) {
			return y * this.width + x;
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
			this.drawCanvas();
			//return false;
		};
		this.zoomOut = function () {
			if (this.pixmult > this.minPixmult) {
				this.pixmult--;
				this.drawCanvas();
			}
			//return false;
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
				ctx.font = (pixmult / 3).toString() + " px sans-serif";
				ctx.textBaseline = "top";
				ctx.textAlign = "left";
				ctx.fillText(this.sqNbrs[index], x * pixmult + pad + 2, y * pixmult + pad);
				if (this.revealSolution) {
					ctx.font = (pixmult).toString() + " px sans-serif";
					ctx.textBaseline = "top";
					ctx.textAlign = "center";
					if (this.grid.charAt(index) !== '-') {
						ctx.fillStyle = "#888888";
						ctx.fillText(this.grid.charAt(index), (x + 0.5) * pixmult + pad, y * pixmult + pad);
					}
					ctx.fillStyle = "#000000";
					ctx.fillText(this.solution.charAt(index), (x + 0.5) * pixmult + pad, y * pixmult + pad);
				} else if (this.grid.charAt(index) !== '-') {
					ctx.font = (pixmult).toString() + " px sans-serif";
					ctx.textBaseline = "top";
					ctx.textAlign = "center";
					ctx.fillText(this.grid.charAt(index), (x + 0.5) * pixmult + pad, y * pixmult + pad);
				}
				if (this.circled(index)) {
					ctx.beginPath();
					ctx.arc(x * pixmult + pad + 1 + radius, y * pixmult + pad + 1 + radius, radius, 0, Math.PI * 2, true);
					ctx.closePath();
					ctx.strokeStyle = "#777777";
					ctx.stroke();
				}
			}
		};
		this.addCluesToDOM = function (clues, idPrefix) {
			var textContainer = this.textContainer,
				x,
				tbl,
				tr,
				td,
				bold;
			tbl = document.createElement("table");
			textContainer.appendChild(tbl);
			for (x = 0; x < clues.length; x += 2) {
				tr = appendChild(tbl, "tr");
				tr.id = idPrefix + clues[x];
				td = appendChild(tr, "td");
				td.align = "right";
				bold = appendChild(td, "b");
				bold.appendChild(document.createTextNode(clues[x]));
				td = appendChild(tr, "td");
				td.appendChild(document.createTextNode(this.strings[3 + clues[x + 1]]));
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

		// reveal the solution
		this.showSolution = function () {
			this.revealSolution = true;
			this.fillAll(this.canv.getContext("2d"));
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

		this.drawBody = function () {
			var textContainer = this.textContainer,
				dv = document.createElement("div");
			dv.id = "help";
			dv.style.display = "none";
			dv.style.borderStyle = "double";
			dv.style.borderColor = "black";
			dv.style.borderWidth = "4px";
			dv.style.padding = "4px";
			appendText("Arrow keys move cursor.", dv);
			appendText("Letter keys enter letter.", dv, true);
			appendText("? shows help.", dv, true);
			appendText("! reveals solution.", dv, true);
			appendText("Mouse click changes cursor position.", dv, true);
			appendText("Mouse click in same cell toggles direction.", dv, true);
			textContainer.appendChild(dv);
			this.showingHelp = false;

			appendPara(this.strings[0], textContainer);
			appendPara("By " + this.strings[1], textContainer);
			appendPara("", textContainer);
			appendBold("ACROSS", textContainer);
			this.addCluesToDOM(this.acrossClues, "acrossClue");

			appendPara("", textContainer);
			appendPara("", textContainer);
			appendBold("DOWN", textContainer);
			this.addCluesToDOM(this.downClues, "downClue");
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

		this.toggleDirection = function () {
			this.unhighlightWord();
			this.direction = -this.direction;
			this.highlightWord();
		};

		// handle mouse click in a cell
		this.click = function (x, y) {
			var canv = this.canv,
				ctx = canv.getContext("2d"),
				oldx = this.cursorX,
				oldy = this.cursorY,
				cursorX = Math.floor((x - canv.offsetLeft) / this.pixmult),
				cursorY = Math.floor((y - canv.offsetTop) / this.pixmult);
			this.cursorX = cursorX;
			this.cursorY = cursorY;

			this.fillCell(oldx, oldy, ctx);
			this.fillCell(cursorX, cursorY, ctx);
			if (cursorX === this.lastClickX && cursorY === this.lastClickY) {
				this.toggleDirection();
			} else {
				this.unhighlightWord();
			}
			this.lastClickX = cursorX;
			this.lastClickY = cursorY;
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
		this.insertAndAdvance = function (charToInsert) {
			var index = this.toIndex(this.cursorX, this.cursorY),
				ctx = this.canv.getContext("2d");
			if (this.grid.charAt(index) !== '.') {
				this.grid = this.grid.substring(0, index) + charToInsert + this.grid.substring(index + 1);
				this.fillCell(this.cursorX, this.cursorY, ctx);
				if (this.direction === this.DIRECTION_ACROSS) {
					this.cursorRight();
				} else if (this.direction === this.DIRECTION_DOWN) {
					this.cursorDown();
				}
				this.fillCell(this.cursorX, this.cursorY, ctx);
			}
		};
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
				e.preventDefault();
				// block arrow key event propagation
				return false;
			}
			// Check for modifiers
			if (kc === 16) {
				this.shiftDown = true;
			} else if (kc === 17) {
				this.ctrlDown = true;
			}
			return true;
		};
		this.onkeyup = function (e) {
			var kc = e.keyCode;
			// Check for modifiers being released
			if (kc === 16) {
				this.shiftDown = false;
			} else if (kc === 17) {
				this.ctrlDown = false;
			}
		};

		// display help in a popup
		this.showHelp = function () {
			document.getElementById("help").style.display = "block";
			this.showingHelp = true;
		};

		// hide help
		this.hideHelp = function () {
			document.getElementById("help").style.display = "none";
			this.showingHelp = false;
		};

		this.onkeypress = function (e) {
			var keynum, keychar, charToInsert;
			this.hideHelp();
			if (window.event) { // IE
				keynum = e.keyCode;
			} else if (e.which) { // NS/Firefox/Opera
				keynum = e.which;
			}
			keychar = String.fromCharCode(keynum);
			if (keychar === "+") {
				return this.zoomIn();
			} else if (keychar === "-") {
				return this.zoomOut();
			} else if (keychar === "?") {
				return this.showHelp();
			} else if (keychar === " ") {
				this.toggleDirection();
				e.preventDefault();
				return false;
			} else if (keychar === "!") {
				this.showSolution();
				e.preventDefault();
				return false;
			}
			if (keychar.match(/[A-Z _\/]/i)) {
				charToInsert = keychar.match(/[_\/]/) ? " " : keychar.toUpperCase();
				this.insertAndAdvance(charToInsert);
				e.preventDefault();
				return false;
			}
		};

		this.minPixmult = 22;
		this.pixmult = this.minPixmult;
		this.padding = 5;
		this.cursorX = 0;
		this.cursorY = 0;
		this.direction = this.DIRECTION_ACROSS;
		this.lastClickX = -1;
		this.lastClickY = -1;
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
					}
					if (sdw) {
						downClues.push(sqNbr);
						downClues.push(clueNum++);
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

	function readContent(url) {
		var xmlhttp = window.XMLHttpRequest ? new XMLHttpRequest() : new ActiveXObject("Microsoft.XMLHTTP");
		xmlhttp.overrideMimeType('text/plain; charset=x-user-defined');
		xmlhttp.open("GET", url, false);
		xmlhttp.send();
		return xmlhttp.responseText;
	}

	function drawPuzzle(puzUrl, canv, textContainer) {
		var filecontents = readContent(puzUrl),
			parsedPuz = parsePuz(filecontents);
		PUZAPP.puz = parsedPuz;
		parsedPuz.canv = canv;
		parsedPuz.textContainer = textContainer;
		PUZAPP.puz.drawCanvas();
		PUZAPP.puz.drawBody();
	}

	function drawPuzzleById(puzUrl, canvId, textContainerId) {
		return drawPuzzle(puzUrl, document.getElementById(canvId), document.getElementById(textContainerId));
	}

	function onkeypress(e) {
		return PUZAPP.puz.onkeypress(e);
	}
	function onclick(e) {
		var x, y;
		if (e.pageX !== undefined && e.pageY !== undefined) {
			x = e.pageX;
			y = e.pageY;
		} else {
			x = e.clientX + document.body.scrollLeft +
				document.documentElement.scrollLeft;
			y = e.clientY + document.body.scrollTop +
				document.documentElement.scrollTop;
		}
		PUZAPP.puz.click(x, y);
	}
	function onkeydown(e) {
		return PUZAPP.puz.onkeydown(e);
	}
	function onkeyup(e) {
		return PUZAPP.puz.onkeyup(e);
	}

	PUZAPP.drawPuzzle = drawPuzzle;
	PUZAPP.drawPuzzleById = drawPuzzleById;
	PUZAPP.onkeypress = onkeypress;
	PUZAPP.onclick = onclick;
	PUZAPP.onkeydown = onkeydown;
	PUZAPP.onkeyup = onkeyup;
}());

