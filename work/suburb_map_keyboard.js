const mapDirection = Object.freeze({
  ArrowLeft: {axis: "x", sign: -1}, ArrowRight: {axis: "x", sign: 1},
  ArrowUp: {axis: "y", sign: -1}, ArrowDown: {axis: "y", sign: 1},
});
const mapDirectionWeight = 2;
const mapEdgeTolerance = 1;

function mapCandidateScore(current, candidate, direction) {
  const horizontal = direction.axis === "x";
  const start = horizontal ? "left" : "top";
  const end = horizontal ? "right" : "bottom";
  const crossStart = horizontal ? "top" : "left";
  const crossEnd = horizontal ? "bottom" : "right";
  const gap = direction.sign > 0 ? candidate[start] - current[end] : current[start] - candidate[end];
  if (gap < -mapEdgeTolerance) return undefined;
  const overlap = candidate[crossStart] < current[crossEnd] && candidate[crossEnd] > current[crossStart];
  const offset = Math.abs((candidate[crossStart] + candidate[crossEnd] - current[crossStart] - current[crossEnd]) / 2);
  return {overlap, distance: Math.max(0, gap) + (overlap ? 0 : mapDirectionWeight * offset), offset};
}

function nextMapPath(map, current, direction) {
  const origin = current.getBoundingClientRect();
  const viewport = map.svg.getBoundingClientRect();
  let best;
  for (const path of map.paths.values()) {
    if (path === current) continue;
    const rect = path.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.right < viewport.left || rect.left > viewport.right ||
        rect.bottom < viewport.top || rect.top > viewport.bottom) continue;
    const score = mapCandidateScore(origin, rect, direction);
    if (!score) continue;
    if (!best || (score.overlap && !best.score.overlap) ||
        (score.overlap === best.score.overlap && (score.distance < best.score.distance ||
         (score.distance === best.score.distance && score.offset < best.score.offset)))) best = {path, score};
  }
  return best?.path;
}

function configureMapKeyboard(map) {
  map.svg.addEventListener("focusin", event => {
    const code = event.target.dataset.code;
    if (map.paths.get(code) === event.target) selectMapArea(map, code);
  });
  map.svg.addEventListener("keydown", event => {
    const direction = mapDirection[event.key];
    const current = event.target;
    if (!direction || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        map.paths.get(current.dataset.code) !== current) return;
    const next = nextMapPath(map, current, direction);
    if (!next) return;
    event.preventDefault();
    next.focus();
    next.scrollIntoView({block: "nearest", inline: "nearest"});
  });
}
