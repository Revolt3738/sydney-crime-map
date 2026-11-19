function gestureFrame(points) {
  const [first, second] = points.values();
  if (!second) return {x: first.x, y: first.y, span: 0};
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    span: Math.hypot(second.x - first.x, second.y - first.y),
  };
}

function gestureExtent({box, previous, current, anchor, scale}) {
  const factor = previous.span && current.span ? current.span / previous.span : 1;
  const [x, y, width, height] = zoomAt(box, factor, anchor);
  const nextScale = scale * factor;
  return [x - (current.x - previous.x) / nextScale,
    y - (current.y - previous.y) / nextScale, width, height];
}

function configureMapGestures(map, update, select) {
  const {svg} = map;
  const points = new Map();
  let previous;
  let moved = false;
  let candidate;

  svg.addEventListener("pointerdown", event => {
    if (event.button !== 0 || points.size >= 2) return;
    if (!points.size) {
      svg.focus({preventScroll: true});
      moved = false;
      candidate = event.target.closest("path[data-code]")?.dataset.code;
    }
    points.set(event.pointerId, {x: event.clientX, y: event.clientY});
    svg.setPointerCapture(event.pointerId);
    previous = gestureFrame(points);
    if (points.size === 2) moved = true;
  });

  svg.addEventListener("pointermove", event => {
    if (!points.has(event.pointerId)) return;
    points.set(event.pointerId, {x: event.clientX, y: event.clientY});
    const current = gestureFrame(points);
    if (!moved && Math.hypot(current.x - previous.x, current.y - previous.y) < mapMovePixels) return;
    moved = true;
    const point = new DOMPoint(previous.x, previous.y).matrixTransform(svg.getScreenCTM().inverse());
    const scale = extentScale(map.box, svg.clientWidth, svg.clientHeight);
    update(gestureExtent({box: map.box, previous, current, anchor: [point.x, point.y], scale}));
    previous = current;
  });

  const end = event => {
    if (!points.delete(event.pointerId)) return;
    previous = points.size ? gestureFrame(points) : undefined;
  };
  svg.addEventListener("pointerup", event => {
    if (!points.has(event.pointerId)) return;
    const distance = Math.hypot(event.clientX - previous.x, event.clientY - previous.y);
    if (!moved && distance < mapMovePixels && candidate) select(candidate);
    end(event);
  });
  svg.addEventListener("pointercancel", end);
  svg.addEventListener("lostpointercapture", event => {
    // A child can lose implicit touch capture when the SVG takes ownership.
    if (event.target === svg) end(event);
  });
}
