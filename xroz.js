/*jslint plusplus: true */
var ActiveXObject, XMLHttpRequest, parsedPuz, filecontents, PUZAPP = {};
(function () {
	"use strict";

	function appendPara(text, textContainer) {
		var txt = document.createTextNode(text), para = document.createElement("p");
		para.appendChild(txt);
		textContainer.appendChild(para);
	}

	function appendLine(text, textContainer) {
		var txt = document.createTextNode(text), br = document.createElement("br");
		textContainer.appendChild(txt);
		textContainer.appendChild(br);
	}

	function appendBold(text, textContainer) {
		var txt = document.createTextNode(text), para = document.createElement("p"), bold = document.createElement("b");
		bold.appendChild(txt);
		para.appendChild(bold);
		textContainer.appendChild(para);
	}

	function Puz() {
		this.isBlack = function (x, y) {
			return this.solution.charAt(y * this.width + x) === '.';
		};
		this.startDownWord = function (x, y) {
			return (y === 0 || this.isBlack(x, y - 1)) && y < this.height - 2 && !this.isBlack(x, y) && !this.isBlack(x, y + 1) && !this.isBlack(x, y + 2);
		};
		this.startAcrossWord = function (x, y) {
			return (x === 0 || this.isBlack(x - 1, y)) && x < this.width - 2 && !this.isBlack(x, y) && !this.isBlack(x + 1, y) && !this.isBlack(x + 2, y);
		};
		this.zoomIn = function () {
			this.pixmult++;
			this.draw();
		};
		this.zoomOut = function () {
			if (this.pixmult > this.minPixmult) {
				this.pixmult--;
				this.draw();
			}
		};
		this.fillCell = function (x, y, ctx) {
			var pixmult = this.pixmult,
				pad = this.padding,
				index = y * this.width + x;
			if (this.cursorX === x && this.cursorY === y) {
				ctx.fillStyle = this.isBlack(x, y) ? "#440" : "#ff0";
			} else {
				ctx.fillStyle = this.isBlack(x, y) ? "#000" : "#fff";
			}
			ctx.fillRect(x * pixmult + pad + 1, y * pixmult + pad + 1, pixmult - 1, pixmult - 1);
			ctx.fillStyle = "#000";
			ctx.font = (pixmult / 3).toString() + " px sans-serif";
			ctx.textBaseline = "top";
			ctx.textAlign = "left";
			ctx.fillText(this.sqNumbers[index], x * pixmult + pad + 1, y * pixmult + pad);
			if (this.grid.charAt(index) !== '-') {
				ctx.font = (pixmult).toString() + " px sans-serif";
				ctx.textBaseline = "top";
				ctx.textAlign = "center";
				ctx.fillText(this.grid.charAt(index), (x + 0.5) * pixmult + pad, y * pixmult + pad);
			}
		};

		this.draw = function () {
			var canv = this.canv,
				textContainer = this.textContainer,
				pixmult = this.pixmult,
				pad = this.padding,
				w = pixmult * this.width,
				wpad = w + 2 * pad,
				h = pixmult * this.height,
				hpad = h + 2 * pad,
				ctx = canv.getContext("2d"),
				sqNum = 1,
				x,
				y;
			canv.width = wpad + 1;
			canv.height = hpad + 1;

			// fill cell contents
			for (y = 0; y < this.height; y++) {
				for (x = 0; x < this.width; x++) {
					this.fillCell(x, y, ctx);
				}
			}
			
			// draw grid lines
			for (x = 0.5; x < w + 1; x += pixmult) {
				ctx.moveTo(x + pad, pad);
				ctx.lineTo(x + pad, h + pad);
			}
			for (y = 0.5; y < h + 1; y += pixmult) {
				ctx.moveTo(pad, y + pad);
				ctx.lineTo(w + pad, y + pad);
			}
			ctx.strokeStyle = "#000";
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
			ctx.strokeStyle = "#fff";
			ctx.stroke();

			appendPara(this.strings[0], textContainer);
			appendPara("By " + this.strings[1], textContainer);
			appendPara("", textContainer);
			appendBold("ACROSS", textContainer);
			x = 0;
			while (x < this.acrossClues.length) {
				appendLine(this.acrossClues[x++] + "   " + this.strings[3 + this.acrossClues[x++]], textContainer);
			}

			appendPara("", textContainer);
			appendPara("", textContainer);
			appendBold("DOWN", textContainer);
			x = 0;
			while (x < this.downClues.length) {
				appendLine(this.downClues[x++] + "   " + this.strings[3 + this.downClues[x++]], textContainer);
			}
		};
		this.click = function (x, y) {
			var canv = this.canv,
				ctx = canv.getContext("2d"),
				oldx = this.cursorX,
				oldy = this.cursorY;
			this.cursorX = Math.floor((x - canv.offsetLeft) / this.pixmult);
			this.cursorY = Math.floor((y - canv.offsetTop) / this.pixmult);

			this.fillCell(oldx, oldy, ctx);
			this.fillCell(this.cursorX, this.cursorY, ctx);
		};
		this.onkeydown = function (e) {
			var oldx = this.cursorX,
				oldy = this.cursorY,
				kc = e.keyCode,
				ctx = this.canv.getContext("2d");
			if (kc === 37) {
				if (oldx > 0) {
					this.cursorX--;
				}
			} else if (kc === 38) {
				if (oldy > 0) {
					this.cursorY--;
				}
			} else if (kc === 39) {
				if (oldx < this.width - 1) {
					this.cursorX++;
				}
			} else if (kc === 40) {
				if (oldy < this.height - 1) {
					this.cursorY++;
				}
			}
			if (oldx !== this.cursorX || oldy !== this.cursorY) {
				this.fillCell(oldx, oldy, ctx);
				this.fillCell(this.cursorX, this.cursorY, ctx);
			}
			if (kc >= 37 && kc <= 40) {
				e.preventDefault();
				return false;
			}
			return true;
			// block arrow key event propagation
			// return kc < 37 || kc > 40;
		};

		this.onkeypress = function (e) {
			var index = this.cursorY * this.width + this.cursorX,
				ctx = this.canv.getContext("2d"),
				keynum,
				keychar;
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
			}
			if (keychar.match(/[A-Z ]/i)) {
//			if (keychar >= 'a' && keychar <= 'z' || keychar >= 'A' && keychar <= 'Z' ) {
				if (this.grid.charAt(index) !== '.') {
					this.grid = this.grid.substring(0, index) + keychar.toUpperCase() + this.grid.substring(index + 1);
					this.fillCell(this.cursorX, this.cursorY, ctx);
					e.preventDefault();
					return false;
				}
			}
		};

		this.minPixmult = 22;
		this.pixmult = this.minPixmult;
		this.padding = 5;
		this.cursorX = 0;
		this.cursorY = 0;
	}

	function getByte(bytes, offset) {
		return bytes.charAt(offset).charCodeAt() % 256;
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
			cksum += bytes.charAt(base + i).charCodeAt();
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
			w = bytes.charAt(44).charCodeAt(),
			h = bytes.charAt(45).charCodeAt(),
			wh = w * h,
			grid_offset = 52 + wh,
			strings_offset = grid_offset + wh,
			cksum = cksum_region(bytes, 52, wh, c_cib),
			nbrClues = getShort(bytes, 46),
			extra_offset = findOffsetOfNth(bytes, strings_offset, '\u0000', nbrClues + 4),
			offset = extra_offset,
			sqNum = 1,
			clueNum = 0,
			acrossClues = [],
			downClues = [],
			sqNumbers = [],
			sectName,
			len,
			chksum,
			compChksum,
			x,
			y,
			saw,
			sdw;
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
			for (x = 0; x < w; x++) {
				sdw = retval.startDownWord(x, y);
				saw = retval.startAcrossWord(x, y);
				sqNumbers.push(sdw || saw ? sqNum.toString() : "");
				if (sdw || saw) {
					if (saw) {
						//acrossClues.push([sqNum, clueNum++]);
						acrossClues.push(sqNum);
						acrossClues.push(clueNum++);
					}
					if (sdw) {
						downClues.push(sqNum);
						downClues.push(clueNum++);
					}
					sqNum++;
				}
			}
		}
		retval.acrossClues = acrossClues;
		retval.downClues = downClues;
		retval.sqNumbers = sqNumbers;
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
			offset += len + 9;
			alert("Extra section " + sectName);
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
		PUZAPP.puz.draw();
	}

	function drawPuzzleById(puzUrl, canvId, textContainerId) {
		return drawPuzzle(puzUrl, document.getElementById(canvId), document.getElementById(textContainerId));
	}

	function onkeypress(e) {
		PUZAPP.puz.onkeypress(e);
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

	PUZAPP.drawPuzzle = drawPuzzle;
	PUZAPP.drawPuzzleById = drawPuzzleById;
	PUZAPP.onkeypress = onkeypress;
	PUZAPP.onclick = onclick;
	PUZAPP.onkeydown = onkeydown;
}());

