const quizByPage = [
  null,
  {
    question: "原始农业出现后，人们的生活发生了什么变化？",
    options: ["开始学习航海", "逐渐从迁徙走向定居", "只在山顶生活"],
    correct: 1,
    success: "答对了。种植让人们可以逐渐定居下来。",
    retry: "想一想，不必经常搬家以后，人们会怎样生活？",
  },
  null,
  {
    question: "稳定耕种以后，人们逐渐形成了什么？",
    options: ["漂在水上的船队", "田野旁的村落", "终年迁徙的队伍"],
    correct: 1,
    success: "答对了。房屋、田地和水源让村落逐渐形成。",
    retry: "看看故事最后，人们把房屋建在了哪里？",
  },
];

const readerViewport = document.querySelector("#readerViewport");
const pageTrack = document.querySelector("#pageTrack");
const pages = [...document.querySelectorAll(".book-page")];
const pageStatus = document.querySelector("#pageStatus");
const pageQuizMark = document.querySelector("#pageQuizMark");
const readingStatus = document.querySelector("#readingStatus");
const quizBoard = document.querySelector("#quizBoard");
const quizEyebrow = document.querySelector("#quizEyebrow");
const collapseQuiz = document.querySelector("#collapseQuiz");
const questionText = document.querySelector("#questionText");
const quizOptions = document.querySelector("#quizOptions");
const quizFeedback = document.querySelector("#quizFeedback");
const listenQuestion = document.querySelector("#listenQuestion");
const gestureTabs = [...document.querySelectorAll("[data-gesture-mode]")];

const PAGE_SETTLE_MS = 620;
const READING_START_MS = 420;
const SWIPE_THRESHOLD_PX = 72;
const FOLLOW_DEAD_ZONE_PX = 150;
const QUIZ_GESTURE_MODES = {
  FOLLOW: "follow",
  THRESHOLD: "threshold",
};

let currentPage = 0;
let selectedAnswer = null;
let isQuizOpen = false;
let quizHandledForVisit = false;
let swipeState = null;
let readingStartTimer = null;
let readingStepTimer = null;
let boardExitTimer = null;
let readingRun = 0;
let quizGestureMode = QUIZ_GESTURE_MODES.FOLLOW;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pageOffset(index = currentPage) {
  return index * -readerViewport.clientWidth;
}

function setTrackOffset(offset) {
  pageTrack.style.transform = `translate3d(${offset}px, 0, 0)`;
}

function updateQuizClosedOffset() {
  const closedX = Math.max(0, quizBoard.clientWidth - quizCard.offsetLeft);
  quizBoard.style.setProperty("--quiz-closed-x", `${closedX}px`);
  return closedX;
}

function setQuizGestureMode(mode) {
  if (!Object.values(QUIZ_GESTURE_MODES).includes(mode) || swipeState) return;

  quizGestureMode = mode;
  document.documentElement.dataset.quizGestureMode = mode;
  gestureTabs.forEach((tab) => {
    const isActive = tab.dataset.gestureMode === mode;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-pressed", String(isActive));
  });

  if (!isQuizOpen) defaultReadingStatus();
}

function hasQuiz(index = currentPage) {
  return Boolean(quizByPage[index]);
}

function hasPendingQuiz() {
  return hasQuiz() && !quizHandledForVisit && !isQuizOpen;
}

function defaultReadingStatus() {
  readingStatus.textContent = hasQuiz()
    ? "本页有题 · 朗读后自动出现"
    : "左右滑动翻页";
}

function prepareReadingWords() {
  const segmenter = "Segmenter" in Intl
    ? new Intl.Segmenter("zh-CN", { granularity: "word" })
    : null;

  pages.forEach((page) => {
    page.querySelectorAll(".book-page__copy p").forEach((paragraph) => {
      const text = paragraph.textContent.trim();
      const fragment = document.createDocumentFragment();
      const segments = segmenter
        ? [...segmenter.segment(text)]
        : [...text].map((segment) => ({ segment, isWordLike: /[\p{L}\p{N}]/u.test(segment) }));

      segments.forEach(({ segment, isWordLike }) => {
        if (!isWordLike) {
          fragment.append(document.createTextNode(segment));
          return;
        }

        const word = document.createElement("span");
        word.className = "reading-word";
        word.textContent = segment;
        fragment.append(word);
      });

      paragraph.replaceChildren(fragment);
    });
  });
}

function stopPageReading({ keepProgress = true } = {}) {
  readingRun += 1;
  window.clearTimeout(readingStartTimer);
  window.clearTimeout(readingStepTimer);

  pages[currentPage]
    ?.querySelectorAll(".reading-word.is-reading")
    .forEach((word) => word.classList.remove("is-reading"));

  if (!keepProgress) {
    pages[currentPage]
      ?.querySelectorAll(".reading-word.is-read")
      .forEach((word) => word.classList.remove("is-read"));
  }

  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function finishPageReading(runId) {
  if (runId !== readingRun) return;

  const currentWords = pages[currentPage].querySelectorAll(".reading-word");
  currentWords.forEach((word) => {
    word.classList.remove("is-reading");
    word.classList.add("is-read");
  });

  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  readingStatus.textContent = hasQuiz() ? "朗读完成 · 题板出现" : "朗读完成 · 左右滑动翻页";

  if (hasPendingQuiz()) {
    readingStepTimer = window.setTimeout(() => openQuiz("reading"), 360);
  }
}

function startPageReading() {
  if (isQuizOpen || swipeState) return;

  stopPageReading({ keepProgress: false });
  const runId = readingRun;
  const page = pages[currentPage];
  const words = [...page.querySelectorAll(".reading-word")];
  const fullText = page.querySelector(".book-page__copy").innerText.trim();

  if (!words.length) {
    finishPageReading(runId);
    return;
  }

  readingStatus.textContent = "正在朗读 · 文字同步高亮";

  if ("speechSynthesis" in window && "SpeechSynthesisUtterance" in window) {
    try {
      const utterance = new SpeechSynthesisUtterance(fullText);
      utterance.lang = "zh-CN";
      utterance.rate = 1.12;
      window.speechSynthesis.speak(utterance);
    } catch {
      // The deterministic visual read-along still runs when speech is unavailable.
    }
  }

  let wordIndex = 0;
  const advance = () => {
    if (runId !== readingRun) return;

    if (wordIndex > 0) {
      words[wordIndex - 1].classList.remove("is-reading");
      words[wordIndex - 1].classList.add("is-read");
    }

    if (wordIndex >= words.length) {
      finishPageReading(runId);
      return;
    }

    const word = words[wordIndex];
    word.classList.add("is-reading");
    const holdMs = clamp(105 + word.textContent.length * 42, 145, 285);
    wordIndex += 1;
    readingStepTimer = window.setTimeout(advance, holdMs);
  };

  advance();
}

function schedulePageReading(delay = READING_START_MS) {
  stopPageReading({ keepProgress: false });
  readingStatus.textContent = "正在准备朗读";
  readingStartTimer = window.setTimeout(startPageReading, delay);
}

function renderQuiz() {
  const quiz = quizByPage[currentPage];
  selectedAnswer = null;
  quizOptions.replaceChildren();
  quizFeedback.textContent = "选一个答案试试看";
  quizFeedback.className = "quiz-feedback";

  if (!quiz) {
    quizEyebrow.textContent = "本页没有题目";
    questionText.textContent = "";
    return;
  }

  quizEyebrow.textContent = `第 ${currentPage + 1} 页 · 本页题目`;
  questionText.textContent = quiz.question;

  quiz.options.forEach((option, index) => {
    const button = document.createElement("button");
    const mark = document.createElement("span");
    const label = document.createElement("span");

    button.type = "button";
    button.className = "quiz-option";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", "false");
    mark.className = "quiz-option__mark";
    mark.textContent = String.fromCharCode(65 + index);
    label.textContent = option;
    button.append(mark, label);
    button.addEventListener("click", () => chooseAnswer(index));
    quizOptions.append(button);
  });
}

function chooseAnswer(index) {
  const quiz = quizByPage[currentPage];
  if (!quiz) return;

  const optionButtons = [...quizOptions.querySelectorAll(".quiz-option")];
  selectedAnswer = index;

  optionButtons.forEach((button, optionIndex) => {
    button.classList.remove("is-correct", "is-wrong");
    button.setAttribute("aria-checked", String(optionIndex === index));
  });

  if (index === quiz.correct) {
    optionButtons[index].classList.add("is-correct");
    quizFeedback.textContent = quiz.success;
    quizFeedback.className = "quiz-feedback is-success";
  } else {
    optionButtons[index].classList.add("is-wrong");
    quizFeedback.textContent = quiz.retry;
    quizFeedback.className = "quiz-feedback is-error";
  }
}

function resetQuizBoardAfterExit() {
  quizBoard.classList.remove("is-exiting-left", "is-dragging", "is-peeking");
  quizBoard.style.removeProperty("transform");
}

function openQuiz(source = "reading", { settleFromDrag = false } = {}) {
  if (!hasQuiz()) return;

  window.clearTimeout(boardExitTimer);
  const draggedTransform = settleFromDrag ? quizBoard.style.transform : "";
  stopPageReading({ keepProgress: true });
  renderQuiz();
  quizHandledForVisit = true;
  isQuizOpen = true;
  quizBoard.classList.remove("is-dragging", "is-peeking", "is-exiting-left");
  quizBoard.classList.add("is-open");
  quizBoard.setAttribute("aria-hidden", "false");

  if (draggedTransform) {
    quizBoard.style.transform = draggedTransform;
    void quizBoard.offsetWidth;
    window.requestAnimationFrame(() => quizBoard.style.removeProperty("transform"));
  } else {
    quizBoard.style.removeProperty("transform");
  }

  readingStatus.textContent = source === "swipe"
    ? "本页有题 · 题板优先展开"
    : "朗读完成 · 题板已展开";
}

function closeQuiz({ direction = "right" } = {}) {
  if (!isQuizOpen && !quizBoard.classList.contains("is-peeking")) return;

  window.clearTimeout(boardExitTimer);
  isQuizOpen = false;
  quizBoard.setAttribute("aria-hidden", "true");
  quizBoard.classList.remove("is-open", "is-peeking", "is-dragging");
  quizBoard.style.removeProperty("transform");

  if (direction === "left") {
    quizBoard.classList.add("is-exiting-left");
    boardExitTimer = window.setTimeout(resetQuizBoardAfterExit, 580);
  } else {
    quizBoard.classList.remove("is-exiting-left");
  }

  defaultReadingStatus();
}

function updatePageControls() {
  setTrackOffset(pageOffset());
  pageStatus.textContent = `${currentPage + 1}/${pages.length}`;
  pageQuizMark.hidden = !hasQuiz();
}

function goToPage(nextIndex) {
  const targetPage = clamp(nextIndex, 0, pages.length - 1);
  if (targetPage === currentPage) {
    setTrackOffset(pageOffset());
    return;
  }

  stopPageReading({ keepProgress: false });
  if (isQuizOpen) closeQuiz({ direction: targetPage > currentPage ? "left" : "right" });

  currentPage = targetPage;
  quizHandledForVisit = false;
  updatePageControls();
  schedulePageReading(PAGE_SETTLE_MS);
}

function speakQuestion() {
  const quiz = quizByPage[currentPage];
  if (!quiz || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    quizFeedback.textContent = "当前浏览器暂不支持朗读。";
    quizFeedback.className = "quiz-feedback is-error";
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(quiz.question);
  utterance.lang = "zh-CN";
  utterance.rate = 0.92;
  window.speechSynthesis.speak(utterance);
}

function beginSwipe(event) {
  if (event.button > 0 || event.target.closest("button")) return;

  swipeState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    deltaX: 0,
    deltaY: 0,
    mode: null,
    boardWasOpen: isQuizOpen,
    quizGestureMode,
    quizPreviewReady: false,
    quizPreviewVisible: false,
    captureTarget: event.currentTarget,
  };

  event.currentTarget.setPointerCapture(event.pointerId);
}

function moveSwipe(event) {
  if (!swipeState || event.pointerId !== swipeState.pointerId) return;

  const deltaX = event.clientX - swipeState.startX;
  const deltaY = event.clientY - swipeState.startY;
  swipeState.deltaX = deltaX;
  swipeState.deltaY = deltaY;

  if (!swipeState.mode) {
    if (Math.hypot(deltaX, deltaY) < 8) return;
    if (Math.abs(deltaY) > Math.abs(deltaX) * 0.9) {
      swipeState.mode = "vertical";
      return;
    }

    stopPageReading({ keepProgress: true });
    swipeState.mode = deltaX < 0 && hasPendingQuiz() ? "quiz" : "page";

    if (swipeState.mode === "page") {
      pageTrack.classList.add("is-dragging");
      if (swipeState.boardWasOpen) quizBoard.classList.add("is-dragging");
      readingStatus.textContent = "正在跟随手势翻页";
    }
  }

  if (swipeState.mode === "vertical") return;
  event.preventDefault();

  if (swipeState.mode === "quiz") {
    if (swipeState.quizGestureMode === QUIZ_GESTURE_MODES.THRESHOLD) {
      setTrackOffset(pageOffset() + Math.min(0, deltaX * 0.12));
      readingStatus.textContent = "阈值触发 · 松手后打开";
      return;
    }

    const followDistance = Math.max(0, -deltaX - FOLLOW_DEAD_ZONE_PX);
    if (followDistance === 0) {
      if (swipeState.quizPreviewVisible) {
        swipeState.quizPreviewVisible = false;
        quizBoard.classList.remove("is-peeking", "is-dragging");
        quizBoard.style.removeProperty("transform");
        quizBoard.setAttribute("aria-hidden", "true");
      }
      setTrackOffset(pageOffset());
      readingStatus.textContent = "回到 150px 内 · 题板取消";
      return;
    }

    if (!swipeState.quizPreviewReady) {
      renderQuiz();
      swipeState.quizPreviewReady = true;
    }
    swipeState.quizPreviewVisible = true;
    quizBoard.classList.add("is-peeking", "is-dragging");
    const rawBoardX = updateQuizClosedOffset() - followDistance;
    const boardX = rawBoardX < 0 ? rawBoardX * 0.22 : rawBoardX;
    quizBoard.style.transform = `translate3d(${boardX}px, 0, 0)`;
    quizBoard.setAttribute("aria-hidden", "true");
    setTrackOffset(pageOffset() + Math.min(0, deltaX * 0.12));
    readingStatus.textContent = rawBoardX < 0
      ? "已超过停靠位 · 松手回弹"
      : "150px 跟手 · 松手展开";
    return;
  }

  let pageDelta = deltaX;
  const atFirstPage = currentPage === 0 && deltaX > 0;
  const atLastPage = currentPage === pages.length - 1 && deltaX < 0;
  if (atFirstPage || atLastPage) pageDelta *= 0.22;

  setTrackOffset(pageOffset() + pageDelta);
  if (swipeState.boardWasOpen) {
    quizBoard.style.transform = `translate3d(${Math.min(0, deltaX)}px, 0, 0)`;
  }
}

function finishSwipe(event, forceCancel = false) {
  if (!swipeState || event.pointerId !== swipeState.pointerId) return;

  const state = swipeState;
  swipeState = null;

  if (state.captureTarget.hasPointerCapture(event.pointerId)) {
    state.captureTarget.releasePointerCapture(event.pointerId);
  }

  pageTrack.classList.remove("is-dragging");
  quizBoard.classList.remove("is-dragging");

  if (state.mode === "quiz") {
    const threshold = state.quizGestureMode === QUIZ_GESTURE_MODES.FOLLOW
      ? FOLLOW_DEAD_ZONE_PX
      : Math.min(SWIPE_THRESHOLD_PX, readerViewport.clientWidth * 0.22);
    const shouldOpen = !forceCancel
      && state.deltaX < -threshold
      && Math.abs(state.deltaX) > Math.abs(state.deltaY) * 1.2;
    setTrackOffset(pageOffset());

    if (shouldOpen) {
      openQuiz("swipe", {
        settleFromDrag: state.quizGestureMode === QUIZ_GESTURE_MODES.FOLLOW
          && state.quizPreviewVisible,
      });
    } else {
      quizBoard.classList.remove("is-peeking");
      quizBoard.style.removeProperty("transform");
      quizBoard.setAttribute("aria-hidden", "true");
      schedulePageReading(480);
    }
    return;
  }

  if (state.mode !== "page") {
    setTrackOffset(pageOffset());
    return;
  }

  const horizontalEnough = Math.abs(state.deltaX) >= SWIPE_THRESHOLD_PX;
  const dominantDirection = Math.abs(state.deltaX) > Math.abs(state.deltaY) * 1.2;
  const direction = state.deltaX < 0 ? 1 : -1;
  const targetPage = clamp(currentPage + direction, 0, pages.length - 1);
  const shouldMove = !forceCancel && horizontalEnough && dominantDirection && targetPage !== currentPage;

  if (shouldMove) {
    goToPage(targetPage);
  } else {
    setTrackOffset(pageOffset());
    if (state.boardWasOpen) {
      quizBoard.classList.add("is-open");
      quizBoard.style.removeProperty("transform");
    } else {
      schedulePageReading(480);
    }
  }
}

prepareReadingWords();
renderQuiz();
updatePageControls();
updateQuizClosedOffset();
setQuizGestureMode(QUIZ_GESTURE_MODES.FOLLOW);
schedulePageReading(700);

collapseQuiz.addEventListener("click", () => closeQuiz());
listenQuestion.addEventListener("click", speakQuestion);
gestureTabs.forEach((tab) => {
  tab.addEventListener("click", () => setQuizGestureMode(tab.dataset.gestureMode));
});

[readerViewport, quizBoard].forEach((surface) => {
  surface.addEventListener("pointerdown", beginSwipe);
  surface.addEventListener("pointermove", moveSwipe);
  surface.addEventListener("pointerup", finishSwipe);
  surface.addEventListener("pointercancel", (event) => finishSwipe(event, true));
});

window.addEventListener("resize", () => {
  if (!swipeState) {
    setTrackOffset(pageOffset());
    updateQuizClosedOffset();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isQuizOpen) closeQuiz();
});
