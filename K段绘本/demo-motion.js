(function () {
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hasGsap = Boolean(window.gsap);
    const interactiveSelector = [
        "a",
        "button",
        ".card",
        ".feature-card",
        ".course-card",
        ".subject-card",
        ".option-item",
        ".task-item",
        ".course-item",
        ".content-card",
        ".feed-card",
        ".achievement-card",
        ".tool-tile",
        ".outfit-card",
        ".chip",
        ".tab-button",
        ".reaction-button"
    ].join(",");
    const clickableSelector = [
        "a[href]",
        "button",
        "[role='button']",
        "[data-action]",
        "[data-view]",
        "[data-tab]",
        "[data-like]",
        "[data-confirm]",
        "[data-outfit]",
        "[data-subject]",
        "[data-kind]",
        "[data-feed-mode]",
        ".option-item",
        ".task-item"
    ].join(",");
    const clickSoundSrc = "../assets/音效/Click - Tap_Done_Checkbox1.wav";

    document.documentElement.classList.remove("gsap-boot");

    function collectRevealNodes(root) {
        const scope = root && root.querySelectorAll ? root : document;
        return Array.from(scope.querySelectorAll([
            ".topbar",
            ".nav",
            ".site-header",
            ".hero",
            ".hero-main",
            ".hero-band",
            ".media-hero",
            ".detail-hero",
            ".header",
            ".section-title",
            ".section-head",
            ".card",
            ".feature-card",
            ".course-card",
            ".subject-card",
            ".question-container",
            ".report-card",
            ".task-section",
            ".course-section",
            ".task-item",
            ".content-card",
            ".feed-card",
            ".progress-card",
            ".achievement-card",
            ".tool-tile",
            ".detail-block",
            ".bundle-strip",
            ".teacher-strip",
            ".safe-note",
            ".encourage-card",
            ".wardrobe-preview"
        ].join(","))).filter((node) => !node.dataset.gsapSeen);
    }

    function reveal(root) {
        if (reduceMotion || !hasGsap) return;
        const nodes = collectRevealNodes(root);
        if (!nodes.length) return;
        nodes.forEach((node) => {
            node.dataset.gsapSeen = "true";
            node.classList.add("gsap-reveal");
        });
        window.gsap.fromTo(nodes, {
            autoAlpha: 0,
            y: 20,
            scale: .985
        }, {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: .62,
            stagger: .045,
            ease: "power3.out",
            clearProps: "opacity,visibility,transform"
        });
    }

    function floatArt() {
        if (reduceMotion || !hasGsap) return;
        window.gsap.to(".hero-illustration, .hero-character, .mascot, .player-character", {
            y: -8,
            rotation: 1.2,
            duration: 2.6,
            yoyo: true,
            repeat: -1,
            ease: "sine.inOut"
        });
    }

    function bindDelegatedFeedback() {
        if (reduceMotion || !hasGsap) return;
        let active = null;

        document.addEventListener("pointerover", (event) => {
            const target = event.target.closest(interactiveSelector);
            if (!target || target.disabled || target === active) return;
            active = target;
            window.gsap.to(target, {
                y: -2,
                scale: 1.012,
                duration: .18,
                ease: "power2.out",
                overwrite: "auto"
            });
        });

        document.addEventListener("pointerout", (event) => {
            const target = event.target.closest(interactiveSelector);
            if (!target || !target.contains(event.relatedTarget)) return;
            if (target === active) active = null;
            window.gsap.to(target, {
                y: 0,
                scale: 1,
                duration: .22,
                ease: "power2.out",
                overwrite: "auto"
            });
        });

        document.addEventListener("pointerdown", (event) => {
            const target = event.target.closest(interactiveSelector);
            if (!target || target.disabled) return;
            window.gsap.to(target, {
                scale: .97,
                duration: .1,
                ease: "power2.out",
                overwrite: "auto"
            });
        });

        document.addEventListener("pointerup", (event) => {
            const target = event.target.closest(interactiveSelector);
            if (!target || target.disabled) return;
            window.gsap.to(target, {
                scale: 1.012,
                duration: .16,
                ease: "back.out(2)",
                overwrite: "auto"
            });
        });
    }

    function playClickSound() {
        const audio = new Audio(clickSoundSrc);
        audio.volume = .38;
        audio.play().catch(() => {});
    }

    function isClickableEnabled(target) {
        if (!target || !document.documentElement.contains(target)) return false;
        if (target.disabled || target.getAttribute("aria-disabled") === "true") return false;
        if (target.closest("[data-sound='none']")) return false;
        return true;
    }

    function bindClickSound() {
        document.addEventListener("click", (event) => {
            const target = event.target.closest(clickableSelector);
            if (!isClickableEnabled(target)) return;
            playClickSound();
        }, true);
    }

    function watchAppRenders() {
        if (reduceMotion || !hasGsap) return;
        const target = document.getElementById("app") || document.body;
        let timer = null;
        const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => reveal(target), 40);
        });
        observer.observe(target, { childList: true, subtree: true });
    }

    function enhanceBackLinks() {
        document.querySelectorAll(".back-button").forEach((button) => {
            if (button.querySelector(".demo-back-mark")) return;
            button.insertAdjacentHTML("afterbegin", '<span class="demo-back-mark" aria-hidden="true"><i class="ph-fill ph-caret-left"></i></span>');
        });
    }

    function init() {
        if (hasGsap && !reduceMotion) {
            window.gsap.to(document.body, { autoAlpha: 1, duration: .12 });
        } else {
            document.body.style.opacity = "1";
        }
        enhanceBackLinks();
        reveal(document);
        floatArt();
        bindDelegatedFeedback();
        bindClickSound();
        watchAppRenders();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
