var viz;
var w, h;
var svg;
var tip;
var cols = 75;
var rows;
var cw, ch;
var pad = 0.8;
var trans = 750;
var lastClick = 0;
var lastArt = null;
var currArtist = null;
var highlightArtist = null;
var allData = [];
var arts = [];
var artsByArtist = {};
var movs = [];
var allArts = [];
var colorScale;
var opScale;
var sizeScale;
var minP, maxP;
var timeline = [];

document.addEventListener("DOMContentLoaded", () => {
  init();
});

function init() {
  viz = document.getElementById("viz");
  w = viz.clientWidth;
  h = viz.clientHeight;
  svg = d3.select("#viz");
  tip = d3.select(".tip");

  rows = Math.ceil(cols * (h / w));
  cw = w / cols;
  ch = h / rows;
  loadData().then(() => {
    setupEvents();
    renderArts("ART");
  });
}

async function loadData() {
  const d = await d3.csv("Cleaned_Art_Dataset.csv");
  allData = d
    .map((d, i) => {
      const p = parseFloat(d.price_amount);
      const y = parseInt(d.clean_year_creation);
      const img = d.filename
        ? `artDataset/${d.filename}`
        : `artDataset/image_${i}.png`;
      return {
        id: i,
        price: p,
        artist: d.artist,
        title: d.title,
        year: y,
        signed: d.signed,
        condition: d.condition,
        period: d.period,
        movement: d.movement,
        imagePath: img,
      };
    })
    .filter((d) => !isNaN(d.price));

  makeArtLayout();
  movs = [...new Set(arts.map((d) => d.movement))];
  colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(movs);
  opScale = d3
    .scaleLinear()
    .domain(
      d3.extent(
        arts.filter((d) => d.year),
        (d) => d.year
      )
    )
    .range([0.6, 1]);
  const prices = arts.map((d) => d.price).filter((p) => !isNaN(p) && p > 0);
  minP = d3.min(prices);
  maxP = d3.max(prices);
  sizeScale = d3.scaleSqrt().domain([minP, maxP]).range([0.8, 1.3]);
  allArts = [...arts];
  artsByArtist = {};
  for (var i = 0; i < allArts.length; i++) {
    var art = allArts[i];
    if (!artsByArtist[art.artist]) {
      artsByArtist[art.artist] = [];
    }
    artsByArtist[art.artist].push(art);
  }
  return Promise.resolve();
}

function makeArtLayout() {
  const canvas = document.getElementById("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  const maxFont = Math.min(w * 0.8, h * 0.8);
  let font = maxFont;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const padText = 0.85;

  do {
    ctx.font = `bold ${font}px Arial, sans-serif`;
    font -= 2;
  } while (ctx.measureText("ART").width >= w * padText && font > 10);

  const finalFont = font + 2;
  ctx.font = `bold ${finalFont}px Arial, sans-serif`;
  ctx.fillStyle = "#ffffff";

  ctx.fillText("ART", w / 2, h / 2 - finalFont * 0.05);
  let pixels = ctx.getImageData(0, 0, w, h).data;
  const checkPixel = (x, y) => {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || x >= w || y < 0 || y >= h || !pixels) {
      return false;
    }
    const i = (y * w + x) * 4;
    return pixels[i + 3] > 128;
  };
  cw = Math.floor(w / cols);
  ch = Math.floor(h / rows);
  const spots = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * cw + cw / 2;
      const cy = r * ch + ch / 2;
      if (checkPixel(cx, cy)) {
        spots.push({
          row: r,
          col: c,
          targetX: c * cw + pad,
          targetY: r * ch + pad,
          width: cw - pad * 2,
          height: ch - pad * 2,
        });
      }
    }
  }

  const spotsByColumn = {};
  spots.forEach((spot) => {
    if (!spotsByColumn[spot.col]) {
      spotsByColumn[spot.col] = [];
    }
    spotsByColumn[spot.col].push(spot);
  });

  Object.values(spotsByColumn).forEach((colSpots) => {
    colSpots.sort((a, b) => a.row - b.row);
  });

  const columns = Object.keys(spotsByColumn)
    .map(Number)
    .sort((a, b) => a - b);
  const artworksWithYear = allData
    .filter((d) => d.year > 0)
    .sort((a, b) => a.year - b.year);

  const artworksNoYear = allData.filter((d) => !d.year || d.year <= 0);
  const sortedArtworks = [...artworksWithYear, ...artworksNoYear];

  let minYear = Infinity;
  let maxYear = -Infinity;
  artworksWithYear.forEach((art) => {
    if (art.year < minYear) minYear = art.year;
    if (art.year > maxYear) maxYear = art.year;
  });
  minYear = Math.floor(minYear / 10) * 10;
  maxYear = Math.ceil(maxYear / 10) * 10;
  timeline = [];
  const columnPositions = columns.map((col) => {
    const spots = spotsByColumn[col];
    return {
      col: col,
      x: spots[0].targetX + cw / 2,
    };
  });

  const yearRange = maxYear - minYear;
  const yearToColumnPosition = (year) => {
    const yearProgress = (year - minYear) / yearRange;
    const colIndex = Math.floor(yearProgress * columnPositions.length);
    return columnPositions[Math.min(colIndex, columnPositions.length - 1)];
  };

  for (let decade = minYear; decade <= maxYear; decade += 10) {
    if (decade === 2030) continue;
    const position = yearToColumnPosition(decade);
    if (position) {
      timeline.push({
        col: position.col,
        year: decade,
        x: position.x,
        isDecade: true,
      });
    }
  }
  arts = [];
  var artworkIndex = 0;
  for (const column of columns) {
    const spots = spotsByColumn[column];
    for (const spot of spots) {
      if (artworkIndex < sortedArtworks.length) {
        const artwork = sortedArtworks[artworkIndex++];
        arts.push({
          ...artwork,
          targetX: spot.targetX,
          targetY: spot.targetY,
          width: spot.width,
          height: spot.height,
          x: spot.targetX,
          y: spot.targetY,
          vx: 0,
          vy: 0,
        });
      }
    }
  }

  allArts = [...arts];
  artsByArtist = {};
  for (var i = 0; i < allArts.length; i++) {
    var art = allArts[i];
    if (!artsByArtist[art.artist]) {
      artsByArtist[art.artist] = [];
    }
    artsByArtist[art.artist].push(art);
  }
}

function setupEvents() {
  const close = document.querySelector(".close");
  close.onclick = () => {
    document.getElementById("myModal").style.display = "none";
  };
  window.onclick = (e) => {
    if (e.target === document.getElementById("myModal")) {
      document.getElementById("myModal").style.display = "none";
    }
  };
}

function makeMovLegend(movs, colors) {
  const movLegend = d3
    .select("#leg")
    .append("div")
    .attr("class", "box-section movement-box");
  movLegend.append("div").attr("class", "box-title").text("Art Movements:");
  movLegend
    .selectAll(".box-item")
    .data(movs)
    .enter()
    .append("div")
    .attr("class", "box-item")
    .style("display", "inline-block")
    .html(
      (
        d
      ) => `<span style="display:inline-block; width:14px; height:14px; background-color:${colors(
        d
      )}; 
   margin-right:5px; border-radius:3px; border:1px solid #fff;"></span>${d}`
    );
}
function resetHighlight() {
  if (currArtist) return;
  svg
    .selectAll(".artwork")
    .style("opacity", 1)
    .style("z-index", null)
    .style("box-shadow", null);
  svg.selectAll(".img-overlay").style("opacity", 0.4);
  d3.select(".connection-lines").selectAll(".artist-connection").remove();
  highlightArtist = null;
}

function highlight(artist, origin, keep = false) {
  resetHighlight();
  if (keep) {
    highlightArtist = artist;
    // console.log("highlight", artist);
  }
  svg.selectAll(".artwork").style("opacity", 0.3).style("z-index", 1);
  svg.selectAll(".img-overlay").style("opacity", 0.2);

  const works = artsByArtist[artist];
  const lines = d3.select(".connection-lines");

  const pos = works.map((art) => ({
    id: art.id,
    x: art.targetX + art.width / 2,
    y: art.targetY + art.height / 2,
    artwork: art,
  }));

  works.forEach((art) => {
    d3.select(`#art-${art.id}`)
      .style("opacity", 1)
      .style("z-index", 99)
      .style("box-shadow", "0 0 15px rgba(255, 255, 0, 0.7)");
    d3.select(`#over-${art.id}`).style("opacity", 0.6);
  });
  if (pos.length > 1) {
    lines
      .selectAll(".artist-connection")
      .data(pos)
      .enter()
      .append("line")
      .attr("class", "artist-connection")
      .attr("x1", (d) => {
        const orig = pos.find((p) => p.id === origin.id);
        return orig ? orig.x : 0;
      })
      .attr("y1", (d) => {
        const orig = pos.find((p) => p.id === origin.id);
        return orig ? orig.y : 0;
      })
      .attr("x2", (d) => d.x)
      .attr("y2", (d) => d.y)
      .style("stroke", "rgba(255, 255, 0, 0.7)")
      .style("stroke-width", 2)
      .style("stroke-dasharray", "5,5")
      .style("opacity", 1);
    // console.log("d" pos.length, "-", artist);
  }
}

function openModal(art) {
  // console.log("OPENING", art.title);
  var modal = document.getElementById("myModal");
  var modalImg = document.getElementById("popupImg");
  var captionText = document.getElementById("caption");

  modal.style.display = "block";
  modalImg.src = art.imagePath;
  var formattedPrice;
  if (art.price) {
    formattedPrice = art.price.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
  } else {
    formattedPrice = "Price unknown";
  }
  var formattedYear;
  if (art.year) {
    formattedYear = art.year;
  } else {
    formattedYear = "Year unknown";
  }
  var captionHTML = `"${art.title}" by ${art.artist}<br>${formattedYear} | ${formattedPrice}<br>Movement: ${art.movement}`;
  captionText.innerHTML = captionHTML;
}
function exitBrowse() {
  d3.select(".popup").remove();
  d3.select("body").on("keydown.browsing", null);
  currArtist = null;
  resetHighlight();
  // console.log("exit");
}

function enterBrowse(artist, startId) {
  if (!artist || !artsByArtist[artist]) return;
  currArtist = artist;
  const works = artsByArtist[artist];
  let idx = works.findIndex((a) => a.id === startId);
  if (idx < 0) idx = 0;
  // console.log( artist, "-", works.length);
  const overlay = d3.select("body").append("div").attr("class", "popup");

  overlay
    .append("div")
    .attr("class", "close-browsing")
    .html("&times;")
    .style("position", "absolute")
    .style("top", "20px")
    .style("right", "30px")
    .style("font-size", "40px")
    .style("color", "white")
    .style("cursor", "pointer")
    .on("click", () => exitBrowse());

  overlay
    .append("h2")
    .text(artist)
    .style("color", "white")
    .style("margin-bottom", "10px");

  overlay
    .append("div")
    .attr("class", "artwork-counter")
    .text(`Artwork ${idx + 1} of ${works.length}`)
    .style("color", "white")
    .style("margin-bottom", "20px");

  const imgCont = overlay
    .append("div")
    .style("position", "relative")
    .style("width", "80%")
    .style("max-width", "800px")
    .style("height", "60vh")
    .style("display", "flex")
    .style("align-items", "center")
    .style("justify-content", "center");

  imgCont
    .append("img")
    .attr("class", "browsing-artwork")
    .attr("src", works[idx].imagePath)
    .style("max-width", "100%")
    .style("max-height", "100%")
    .style("border", "3px solid white");

  if (works.length > 1) {
    overlay
      .append("div")
      .attr("class", "nav")
      .style("margin-top", "20px")
      .style("display", "flex")
      .style("gap", "20px")
      .html(
        ` <button class="prev">Previous</button> <button class="next">Next</button>`
      );

    const update = () => {
      d3.select(".artwork-counter").text(
        `Artwork ${idx + 1} of ${works.length}`
      );
      d3.select(".browsing-artwork").attr("src", works[idx].imagePath);
      d3.select(".artwork-details").html(` <div><strong>${
        works[idx].title
      }</strong></div>
 <div>Year: ${works[idx].year}</div>
 <div>Price: ${
   works[idx].price
     ? works[idx].price.toLocaleString("en-US", {
         style: "currency",
         currency: "USD",
       })
     : "Unknown"
 }</div>
<div>Movement: ${works[idx].movement}</div>`);
    };

    d3.select(".prev").on("click", () => {
      idx = (idx - 1 + works.length) % works.length;
      update();
    });
    d3.select(".next").on("click", () => {
      idx = (idx + 1) % works.length;
      update();
    });
  }
  overlay
    .append("div")
    .attr("class", "artwork-details")
    .style("color", "white")
    .style("margin-top", "20px")
    .style("text-align", "center").html(` <div><strong>${
    works[idx].title
  }</strong></div>
 <div>Year: ${works[idx].year}</div>
 <div>Price: ${
   works[idx].price
     ? works[idx].price.toLocaleString("en-US", {
         style: "currency",
         currency: "USD",
       })
     : "Unknown"
 }</div>
 <div>Movement: ${works[idx].movement}</div> `);
}

function makePriceLegend() {
  // console.log("reaching here");
  const priceLegend = d3
    .select("#leg")
    .append("div")
    .attr("class", "box-section price-box");
  priceLegend.append("div").attr("class", "box-title").text("Price:");
  const fmt = d3.format("$,.0f");
  const prices = [
    { label: "Low", price: minP, factor: 0.7 },
    { label: "Med", price: Math.round((minP + maxP) / 2), factor: 1 },
    { label: "High", price: maxP, factor: 1.3 },
  ];
  const priceItems = priceLegend
    .selectAll(".price-box-item")
    .data(prices)
    .enter()
    .append("div")
    .attr("class", "box-item price-box-item")
    .style("display", "block")
    .style("margin-bottom", "8px");
  const size = 14;
  priceItems
    .append("div")
    .style("display", "inline-block")
    .style("width", (d) => `${size * d.factor}px`)
    .style("height", (d) => `${size * d.factor}px`)
    .style("background-color", "#666")
    .style("margin-right", "5px")
    .style("border", "1px solid rgba(255,255,255,0.4)")
    .style("vertical-align", "middle")
    .style("position", "relative")
    .each(function (d) {
      if (d.factor > 1.1) {
        d3.select(this)
          .append("div")
          .style("position", "absolute")
          .style("bottom", "2px")
          .style("right", "2px")
          .style("width", "4px")
          .style("height", "4px")
          .style("border-radius", "50%")
          .style("background-color", "gold");
      }
    });
  priceItems.append("span").text((d) => `${d.label} (${fmt(d.price)})`);
  // console.log( minP, maxP);
}

function renderArts(layout) {
  currArtist = null;
  highlightArtist = null;
  svg.html("");
  d3.select("#leg").html("");
  const lines = svg
    .append("svg")
    .attr("class", "connection-lines")
    .attr("width", w)
    .attr("height", h)
    .style("position", "absolute")
    .style("top", 0)
    .style("left", 0)
    .style("pointer-events", "none")
    .style("z-index", 50);

  makePriceLegend();
  makeMovLegend(movs, colorScale);

  svg.on("click", (e) => {
    if (e.target === document.getElementById("viz")) {
      resetHighlight();
      highlightArtist = null;
    }
  });
  if (timeline && timeline.length > 0) {
    const timelineSvg = svg
      .append("svg")
      .attr("class", "timeline-markers")
      .attr("width", w)
      .attr("height", h)
      .style("position", "absolute")
      .style("top", 0)
      .style("left", 0)
      .style("pointer-events", "none")
      .style("z-index", 40);
    timelineSvg
      .selectAll(".time-line")
      .data(timeline)
      .enter()
      .append("line")
      .attr("class", "time-line")
      .attr("x1", (d) => d.x)
      .attr("y1", 25)
      .attr("x2", (d) => d.x)
      .attr("y2", h)
      .style("stroke", "rgba(255,255,255,0.2)")
      .style("stroke-width", (d) => (d.isDecade ? 1.5 : 1))
      .style("stroke-dasharray", "4,4");

    timelineSvg
      .selectAll(".time-label")
      .data(timeline)
      .enter()
      .append("text")
      .attr("class", "time-label")
      .attr("x", (d) => d.x)
      .attr("y", 15)
      .attr("text-anchor", "middle")
      .style("fill", "rgba(255,255,255,0.8)")
      .style("font-size", "12px")
      .style("font-weight", "bold")
      .style("font-family", "Arial, sans-serif")
      .text((d) => `${d.year}s`);

    timelineSvg
      .selectAll(".time-tick")
      .data(timeline)
      .enter()
      .append("rect")
      .attr("class", "time-tick")
      .attr("x", (d) => d.x - 1)
      .attr("y", 22)
      .attr("width", 2)
      .attr("height", 6)
      .style("fill", "rgba(255,255,255,0.8)");
    // console.log("timeline ", timeline.length);
  }

  svg
    .selectAll(".img-container")
    .data(allArts, (d) => d.id)
    .join((enter) => {
      const getSize = function (d) {
        if (!d.price) return 1.1;
        return sizeScale(d.price);
      };
      const getDims = function (d) {
        const s = getSize(d);
        const w = d.width * s;
        const h = d.height * s;
        const ox = (w - d.width) / 2;
        const oy = (h - d.height) / 2;
        return {
          width: w,
          height: h,
          x: d.targetX - ox,
          y: d.targetY - oy,
        };
      };
      const container = enter
        .append("div")
        .attr("class", "img-container")
        .style("position", "absolute")
        .each(function (d) {
          const dims = getDims(d);
          d3.select(this)
            .style("left", `${dims.x}px`)
            .style("top", `${dims.y}px`)
            .style("width", `${dims.width}px`)
            .style("height", `${dims.height}px`);
        })
        .style("margin", `${pad}px`)
        .style("cursor", "pointer")
        .style("overflow", "hidden")
        .style("z-index", (d) => (getSize(d) > 1 ? 2 : 1))
        .style("border", "none")
        .style("transition", "all 0.3s ease");

      container
        .append("img")
        .attr("class", "artwork")
        .attr("id", (d) => `art-${d.id}`)
        .attr("src", (d) => d.imagePath)
        .attr("alt", (d) => `${d.title} by ${d.artist}`)
        .style("position", "absolute")
        .style("top", 0)
        .style("left", 0)
        .style("width", "100%")
        .style("height", "100%")
        .style("object-fit", "cover")
        .style("opacity", 0);
      container
        .append("div")
        .attr("class", "img-overlay")
        .attr("id", (d) => `over-${d.id}`)
        .style("background-color", (d) => colorScale(d.movement))
        .style("opacity", "0.6");

      setupInteractions(container);
      container
        .select(".artwork")
        .transition()
        .duration(trans)
        .style("opacity", 1);
      container
        .filter((d) => getSize(d) > 1.1)
        .append("div")
        .attr("class", "price-dot")
        .style("position", "absolute")

        .style("bottom", "3px")
        .style("right", "3px")
        .style("width", "6px")
        .style("height", "6px")
        .style("border-radius", "50%")
        .style("background-color", "gold")
        .style("z-index", 3);
      return container;
    });
  d3.selectAll(".popup").remove();
  currArtist = null;
  highlightArtist = null;
  //   console.log( allArts.length, "-", "layout");
}

function setupInteractions(container) {
  const fmt = d3.format("$,.0f");

  container
    .on("mouseover", (e, d) => {
      tip
        .html(
          `<div class="tip-title">${d.title}</div>
  <div class="tip-artist">${d.artist}</div>
  <div class="tip-details">
  <div>${d.year}</div>
  <div class="tip-price">${fmt(d.price)}</div>
    <div>${d.movement}</div>
    </div> `
        )

        .style("left", `${e.pageX + 15}px`)
        .style("top", `${e.pageY - 28}px`)
        .style("opacity", 1);
      if (!currArtist) {
        if (!highlightArtist) {
          highlight(d.artist, d, false);
        } else if (highlightArtist === d.artist) {
          const works = artsByArtist[d.artist];
          const reordered = [d, ...works.filter((w) => w.id !== d.id)];
        }
      }
      e.stopPropagation();
    })
    .on("mousemove", (e) => {
      tip.style("left", `${e.pageX + 15}px`).style("top", `${e.pageY - 28}px`);
    })
    .on("mouseout", (e, d) => {
      tip.style("opacity", 0);
      if (!currArtist && !highlightArtist) {
        resetHighlight();
      }
    })
    .on("click", (e, d) => {
      const now = new Date().getTime();
      const since = now - lastClick;
      e.stopPropagation();
      if (since < 300 && lastArt === d.id) {
        if (
          !currArtist &&
          artsByArtist[d.artist] &&
          artsByArtist[d.artist].length > 0
        ) {
          enterBrowse(d.artist, d.id);
        }
      } else {
        if (highlightArtist === d.artist) {
          resetHighlight();
        } else {
          highlight(d.artist, d, true);
        }
      }
      lastClick = now;
      lastArt = d.id;
    });
}
