/**
 * 设定图点击放大。
 * 仅使用原生 DOM 接口，不依赖第三方库；监听挂载在 document 上，
 * 因此在 Material 的即时导航（navigation.instant）替换内容区后仍然有效。
 */
(function () {
  var overlay = null;

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.body.style.overflow = "";
  }

  function open(src, alt) {
    overlay = document.createElement("div");
    overlay.className = "coaw-lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", alt || "设定图");

    var image = document.createElement("img");
    image.src = src;
    image.alt = alt || "";
    overlay.appendChild(image);

    overlay.addEventListener("click", close);
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";
  }

  document.addEventListener("click", function (event) {
    if (overlay) return;
    var image = event.target.closest(".md-content img");
    if (!image) return;
    event.preventDefault();
    open(image.currentSrc || image.src, image.alt);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") close();
  });
})();
