const lessons = [
  {
    id: "framework",
    title: "形副词与比较级",
    tab: "笔记一：语法框架",
    tag: "体系挖空",
    image: "./assets/framework.png",
    imageTall: true,
    summary: "把形副词解析、形容词变副词、比较级构成和常见句型串成一张可复习的框架。",
    highlights: [
      "形容词常修饰名词，副词常修饰动词、形容词、副词或整句。",
      "形容词变副词要关注 ly、y 变 ily、le 结尾去 e 加 y、ic 加 ally。",
      "比较级用于两者比较，最高级用于三者及以上范围。"
    ],
    cloze: {
      title: "点空选择：把核心术语补回去",
      hint: "点击黄色空格后选答案，系统会立即判断。",
      parts: [
        "形容词通常修饰",
        { id: "fw1", answer: "名词", options: ["动词", "名词", "整句"] },
        "，副词通常修饰",
        { id: "fw2", answer: "动词/形容词/副词", options: ["动词/形容词/副词", "冠词", "介词短语"] },
        "。比较级用于",
        { id: "fw3", answer: "两者", options: ["两者", "三者及以上", "所有情况"] },
        "之间的比较，最高级用于",
        { id: "fw4", answer: "三者及以上", options: ["任意两项", "三者及以上", "一个对象"] },
        "范围。"
      ]
    },
    input: {
      title: "直接输入：规则默写",
      hint: "可以输入中文或常见英文符号，空格不影响判断。",
      items: [
        { id: "fi1", prompt: "辅音字母 + y 结尾的形容词变副词时，通常把 y 改成什么？", answer: "ily", accepted: ["ily"] },
        { id: "fi2", prompt: "A ... 比较级 + than + B 表示什么？", answer: "A比B更...", accepted: ["A比B更", "比B更", "更"] },
        { id: "fi3", prompt: "the + 比较级，the + 比较级 表示什么？", answer: "越...越...", accepted: ["越越", "越...越...", "越……越……"] }
      ]
    },
    steps: {
      title: "步骤回忆：做语法题的顺序",
      hint: "按合理顺序点击下面的卡片。",
      items: [
        "先判断空格需要形容词还是副词",
        "再看单词变化规则：ly、ily、ally 等",
        "最后代入比较级或最高级句型检查语义"
      ]
    },
    match: {
      title: "概念配对：句型对应含义",
      hint: "给每个句型选择正确解释。",
      items: [
        {
          prompt: "A + as + 原级 + as + B",
          answer: "A和B一样",
          options: ["A比B更", "A和B一样", "A是三者中最"]
        },
        {
          prompt: "A + 比较级 + than + B",
          answer: "A比B更",
          options: ["A比B更", "A不如B", "越...越..."]
        },
        {
          prompt: "the + 比较级，the + 比较级",
          answer: "越...越...",
          options: ["越...越...", "和...一样", "两者中较...的"]
        }
      ]
    }
  },
  {
    id: "example",
    title: "图像共存问题",
    tab: "笔记二：例题步骤",
    tag: "步骤训练",
    image: "./assets/example.png",
    imageTall: false,
    summary: "这类题不靠硬算，关键是抓确定信息，再用公共参数排除矛盾图像。",
    highlights: [
      "直线 y = x + m 的系数为正，所以直线应该上升。",
      "反比例函数 y = m/x 的象限由 m 的正负决定。",
      "当直线和双曲线共享参数 m 时，可以用一个图形推出 m 的范围，再检验另一个图形。"
    ],
    cloze: {
      title: "点空选择：补回排除法关键步骤",
      hint: "点击空格，选出例题步骤里的核心词。",
      parts: [
        "排除法先抓",
        { id: "ex1", answer: "确定信息", options: ["题目背景", "确定信息", "答案位置"] },
        "，再用",
        { id: "ex2", answer: "公共参数", options: ["公共参数", "图形颜色", "选项字母"] },
        "找矛盾。若某个选项中 m 的正负与图像位置冲突，就可以",
        { id: "ex3", answer: "排除", options: ["排除", "代入", "保留"] },
        "。"
      ]
    },
    input: {
      title: "直接输入：从题干抓信息",
      hint: "输入这道例题中最关键的系数、参数或结论。",
      items: [
        { id: "ei1", prompt: "直线 y = 1·x + m 的一次项系数是多少？", answer: "1", accepted: ["1", "+1"] },
        { id: "ei2", prompt: "直线和双曲线共用的参数是什么？", answer: "m", accepted: ["m", "M"] },
        { id: "ei3", prompt: "图像有矛盾时，排除法要做什么？", answer: "排除", accepted: ["排除", "排除该选项"] }
      ]
    },
    steps: {
      title: "步骤回忆：复原排除法流程",
      hint: "把做题步骤按先后顺序排好。",
      items: [
        "抓确定信息：已知系数、必过定点",
        "用公共参数找矛盾：由图像判断 m 的正负",
        "有矛盾则排除，剩下的选项再验证"
      ]
    },
    match: {
      title: "判断配对：图像信息对应结论",
      hint: "给每条图像线索选择它能推出的结论。",
      items: [
        {
          prompt: "直线 y = x + m 中 x 的系数为正",
          answer: "直线应从左下到右上",
          options: ["直线应从左下到右上", "双曲线在二四象限", "m 一定为 0"]
        },
        {
          prompt: "双曲线 y = m/x 在一、三象限",
          answer: "m > 0",
          options: ["m > 0", "m < 0", "m = 0"]
        },
        {
          prompt: "同一个选项里 m 的正负判断互相冲突",
          answer: "直接排除",
          options: ["直接排除", "一定正确", "无法判断"]
        }
      ]
    }
  },
  {
    id: "geometry",
    title: "圆的位置关系",
    tab: "笔记三：图形公式",
    tag: "图形配对",
    image: "./assets/geometry.png",
    imageTall: true,
    summary: "点、直线、圆与圆的位置关系，都可以转化为距离 d 和半径 r、R 的大小比较。",
    highlights: [
      "点与圆：圆内 d < r，圆上 d = r，圆外 d > r。",
      "直线与圆：相离、相切、相交分别对应 0、1、2 个交点。",
      "圆与圆：把圆心距 d 与 R + r、R - r 对比。"
    ],
    cloze: {
      title: "点空选择：把公式关系补完整",
      hint: "先看图，再补符号和交点个数。",
      parts: [
        "点在圆内时 d ",
        { id: "ge1", answer: "<", options: ["<", "=", ">"] },
        " r；点在圆上时 d ",
        { id: "ge2", answer: "=", options: ["<", "=", ">"] },
        " r；直线与圆相切时交点个数为",
        { id: "ge3", answer: "1", options: ["0", "1", "2"] },
        "；两圆相交满足",
        { id: "ge4", answer: "R-r<d<R+r", options: ["d>R+r", "d=R+r", "R-r<d<R+r"] },
        "。"
      ]
    },
    input: {
      title: "直接输入：公式默写",
      hint: "符号可以直接输入，例如 <、=、>。",
      items: [
        { id: "gi1", prompt: "点在圆外时，d 与 r 的关系是什么？", answer: "d>r", accepted: ["d>r", ">"] },
        { id: "gi2", prompt: "直线与圆相切时，交点个数是多少？", answer: "1", accepted: ["1", "一个", "1个"] },
        { id: "gi3", prompt: "两圆外切时，d 与 R、r 的关系是什么？", answer: "d=R+r", accepted: ["d=R+r", "d=r+r", "=R+r", "等于R+r"] }
      ]
    },
    steps: {
      title: "步骤回忆：关系判定三步",
      hint: "这类图形题先算距离，再比较。",
      items: [
        "求距离 d：点到圆心、圆心到直线或圆心距",
        "拿 d 与 r、R + r、R - r 作比较",
        "根据大小关系判定位置和交点个数"
      ]
    },
    match: {
      title: "图形配对：位置关系对应公式",
      hint: "选择每种关系对应的判定式。",
      items: [
        {
          prompt: "两圆外离",
          answer: "d > R + r",
          options: ["d > R + r", "d = R + r", "R - r < d < R + r"]
        },
        {
          prompt: "两圆相交",
          answer: "R - r < d < R + r",
          options: ["d = R - r", "R - r < d < R + r", "0 <= d < R - r"]
        },
        {
          prompt: "直线与圆相切",
          answer: "d = r",
          options: ["d > r", "d = r", "d < r"]
        },
        {
          prompt: "点在圆内",
          answer: "d < r",
          options: ["d < r", "d = r", "d > r"]
        }
      ]
    }
  }
];

const state = {
  lessonId: lessons[0].id,
  practiceTab: "choice",
  isPracticing: false,
  activeBlankId: null,
  choiceAnswers: {},
  inputAnswers: {},
  stepOrders: {},
  matchAnswers: {},
  masteredLessons: {},
  feedback: ""
};

const practiceTabs = [
  { id: "choice", label: "选择题" },
  { id: "input", label: "填空题" },
  { id: "steps", label: "步骤排序" },
  { id: "match", label: "知识配对" }
];

const lessonTabs = document.querySelector("#lessonTabs");
const content = document.querySelector("#appContent");

function currentLesson() {
  return lessons.find((lesson) => lesson.id === state.lessonId) || lessons[0];
}

function normalize(value) {
  return String(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(/[，。,.]/g, "")
    .toLowerCase();
}

function isInputCorrect(item, value) {
  const all = [item.answer, ...(item.accepted || [])].map(normalize);
  return all.includes(normalize(value));
}

function renderLessonTabs() {
  lessonTabs.innerHTML = lessons
    .map((lesson) => {
      const active = lesson.id === state.lessonId ? "is-active" : "";
      return `<button class="lesson-tab ${active}" type="button" data-lesson="${lesson.id}">${lesson.tab}</button>`;
    })
    .join("");
}

function renderPracticeEntry(lesson) {
  const mastered = Boolean(state.masteredLessons[lesson.id]);
  return `
    <button class="practice-launch ${mastered ? "is-mastered" : "is-unpracticed"}" type="button" data-action="start-practice">
      <span class="practice-launch-copy">
        <strong>${mastered ? "再练一次" : "练习该笔记"}</strong>
        <small>${mastered ? "继续巩固这篇笔记" : "点击后开始做题"}</small>
      </span>
      <span class="practice-launch-status ${mastered ? "is-mastered" : ""}">${mastered ? "已掌握" : "未练习"}</span>
    </button>
  `;
}

function renderSourceImage(lesson) {
  return `
    <article class="note-image-wrap ${lesson.imageTall ? "is-tall" : ""}">
      <div class="note-image-toolbar">
        <span>原笔记预览</span>
        <span>阅读时保留完整上下文</span>
      </div>
      <img src="${lesson.image}" alt="${lesson.title}原笔记" />
    </article>
  `;
}

function renderRead() {
  const lesson = currentLesson();
  content.innerHTML = renderPracticeEntry(lesson) + renderSourceImage(lesson);
  removeOptionPanel();
}

function blankState(blank) {
  const selected = state.choiceAnswers[blank.id];
  if (!selected) return "is-empty";
  return selected === blank.answer ? "is-correct" : "is-wrong";
}

function renderPracticeTitle(title) {
  const mastered = Boolean(state.masteredLessons[state.lessonId]);
  return `
    <div class="practice-title-row">
      <h3>${title}</h3>
      ${mastered ? '<span class="mastery-badge">已掌握</span>' : ""}
    </div>
  `;
}

function renderPracticeControls() {
  return `
    <div class="practice-controls">
      <label class="practice-mode-picker">
        <span>练习玩法</span>
        <select class="practice-mode-select" data-practice-select aria-label="切换练习玩法">
          ${practiceTabs
            .map((tab) => `<option value="${tab.id}" ${tab.id === state.practiceTab ? "selected" : ""}>${tab.label}</option>`)
            .join("")}
        </select>
      </label>
      <button class="practice-exit" data-action="exit-practice" type="button">返回笔记</button>
    </div>
  `;
}

function renderCloze() {
  const lesson = currentLesson();
  const htmlParts = lesson.cloze.parts
    .map((part) => {
      if (typeof part === "string") return part;
      const selected = state.choiceAnswers[part.id] || "";
      const label = selected ? selected : "";
      const isActive = state.activeBlankId === part.id;
      return `<button class="blank-token ${blankState(part)}${isActive ? " is-active" : ""}" type="button" data-blank="${part.id}" aria-expanded="${isActive}">${label}</button>`;
    })
    .join("");

  return `
    <section class="practice-panel">
      ${renderPracticeTitle(lesson.cloze.title)}
      <p class="practice-hint">${lesson.cloze.hint}</p>
      <p class="cloze-text">${htmlParts}</p>
      <p class="feedback-line ${feedbackClass()}">${state.feedback}</p>
      ${renderPracticeControls()}
    </section>
  `;
}

function renderInputPractice() {
  const lesson = currentLesson();
  return `
    <section class="practice-panel">
      ${renderPracticeTitle(lesson.input.title)}
      <p class="practice-hint">${lesson.input.hint}</p>
      <div class="input-list">
        ${lesson.input.items
          .map((item) => {
            const value = state.inputAnswers[item.id] || "";
            const status = value ? (isInputCorrect(item, value) ? "is-correct" : "is-wrong") : "";
            return `
              <div class="input-row">
                <label for="${item.id}">${item.prompt}</label>
                <input class="answer-input ${status}" id="${item.id}" data-input="${item.id}" value="${value}" autocomplete="off" />
              </div>
            `;
          })
          .join("")}
      </div>
      <div class="button-row">
        <button class="primary-button" data-action="check-input" type="button">检查答案</button>
        <button class="soft-button" data-action="clear-input" type="button">清空</button>
      </div>
      <p class="feedback-line ${feedbackClass()}">${state.feedback}</p>
      ${renderPracticeControls()}
    </section>
  `;
}

function shuffledStepItems(lesson) {
  const ids = lesson.steps.items.map((_, index) => index);
  if (lesson.id === "framework") return [1, 0, 2];
  if (lesson.id === "example") return [2, 0, 1];
  return [1, 2, 0];
}

function renderSteps() {
  const lesson = currentLesson();
  const order = state.stepOrders[lesson.id] || [];
  const available = shuffledStepItems(lesson);

  return `
    <section class="practice-panel">
      ${renderPracticeTitle(lesson.steps.title)}
      <p class="practice-hint">${lesson.steps.hint}</p>
      <div class="step-board">
        <div class="step-slots">
          ${lesson.steps.items
            .map((_, index) => {
              const picked = order[index];
              const text = picked === undefined ? "等待选择步骤" : lesson.steps.items[picked];
              return `<div class="step-slot"><strong>${index + 1}</strong><span>${text}</span></div>`;
            })
            .join("")}
        </div>
        <div class="step-bank">
          ${available
            .map((stepIndex) => {
              const disabled = order.includes(stepIndex) ? "disabled" : "";
              return `<button class="step-card" type="button" data-step="${stepIndex}" ${disabled}>${lesson.steps.items[stepIndex]}</button>`;
            })
            .join("")}
        </div>
      </div>
      <div class="button-row">
        <button class="primary-button" data-action="check-steps" type="button">检查顺序</button>
        <button class="soft-button" data-action="reset-steps" type="button">重排</button>
      </div>
      <p class="feedback-line ${feedbackClass()}">${state.feedback}</p>
      ${renderPracticeControls()}
    </section>
  `;
}

function renderMatch() {
  const lesson = currentLesson();
  return `
    <section class="practice-panel">
      ${renderPracticeTitle(lesson.match.title)}
      <p class="practice-hint">${lesson.match.hint}</p>
      <div class="match-list">
        ${lesson.match.items
          .map((item, rowIndex) => {
            const picked = state.matchAnswers[`${lesson.id}-${rowIndex}`];
            return `
              <div class="match-row">
                <p class="match-question">${item.prompt}</p>
                <div class="match-options">
                  ${item.options
                    .map((option) => {
                      let status = "";
                      if (picked === option) status = option === item.answer ? "is-correct" : "is-wrong";
                      return `<button class="choice-button ${status}" type="button" data-match-row="${rowIndex}" data-match-option="${option}">${option}</button>`;
                    })
                    .join("")}
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
      <p class="feedback-line ${feedbackClass()}">${state.feedback}</p>
      ${renderPracticeControls()}
    </section>
  `;
}

function renderPractice() {
  const tabRenderer = {
    choice: renderCloze,
    input: renderInputPractice,
    steps: renderSteps,
    match: renderMatch
  };

  content.innerHTML = tabRenderer[state.practiceTab]() + renderSourceImage(currentLesson());

  if (state.practiceTab !== "choice") {
    removeOptionPanel();
  }
}

function feedbackClass() {
  if (!state.feedback) return "";
  if (state.feedback.includes("正确") || state.feedback.includes("全对") || state.feedback.includes("顺序对了")) return "good";
  return "bad";
}

function render() {
  renderLessonTabs();
  if (state.isPracticing) renderPractice();
  else renderRead();
}

function resetLessonAnswers(lesson) {
  lesson.cloze.parts.forEach((part) => {
    if (typeof part !== "string") delete state.choiceAnswers[part.id];
  });
  lesson.input.items.forEach((item) => delete state.inputAnswers[item.id]);
  state.stepOrders[lesson.id] = [];
  lesson.match.items.forEach((_, index) => delete state.matchAnswers[`${lesson.id}-${index}`]);
}

function startPractice() {
  const lesson = currentLesson();
  state.isPracticing = true;
  state.practiceTab = "choice";
  state.activeBlankId = null;
  state.feedback = "";
  resetLessonAnswers(lesson);
  removeOptionPanel();
  content.scrollTop = 0;
  renderPractice();
}

function exitPractice() {
  state.isPracticing = false;
  state.activeBlankId = null;
  state.feedback = "";
  removeOptionPanel();
  content.scrollTop = 0;
  renderRead();
  content.querySelector("[data-action='start-practice']")?.focus();
}

function markCurrentLessonMastered() {
  state.masteredLessons[state.lessonId] = true;
}

function isChoicePracticeComplete(lesson) {
  return lesson.cloze.parts
    .filter((part) => typeof part !== "string")
    .every((part) => state.choiceAnswers[part.id] === part.answer);
}

function isMatchPracticeComplete(lesson) {
  return lesson.match.items.every((item, index) => state.matchAnswers[`${lesson.id}-${index}`] === item.answer);
}

function findBlank(blankId) {
  return currentLesson().cloze.parts.find((part) => typeof part !== "string" && part.id === blankId);
}

function showOptionPanel(blankId) {
  const blank = findBlank(blankId);
  if (!blank) return;
  removeOptionPanel();

  const panel = document.createElement("section");
  panel.className = "option-panel";
  panel.setAttribute("aria-label", "答案选项");
  panel.innerHTML = `
    <header>
      <h3>选择要填入的内容</h3>
      <button class="close-options" type="button" data-action="close-options" aria-label="关闭选项">×</button>
    </header>
    <div class="option-list">
      ${blank.options.map((option) => `<button class="option-chip" type="button" data-option="${option}">${option}</button>`).join("")}
    </div>
  `;
  content.querySelector(".cloze-text")?.insertAdjacentElement("afterend", panel);
}

function removeOptionPanel() {
  document.querySelectorAll(".option-panel").forEach((panel) => panel.remove());
}

function setActiveBlank(blankId) {
  state.activeBlankId = blankId;
  content.querySelectorAll("[data-blank]").forEach((button) => {
    const isActive = button.dataset.blank === blankId;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-expanded", String(isActive));
  });
}

function setFeedback(message) {
  state.feedback = message;
}

lessonTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-lesson]");
  if (!button) return;
  state.lessonId = button.dataset.lesson;
  state.isPracticing = false;
  state.practiceTab = "choice";
  state.activeBlankId = null;
  state.feedback = "";
  removeOptionPanel();
  content.scrollTop = 0;
  render();
});

content.addEventListener("click", (event) => {
  const blankButton = event.target.closest("[data-blank]");
  if (blankButton) {
    setActiveBlank(blankButton.dataset.blank);
    showOptionPanel(state.activeBlankId);
    return;
  }

  const stepButton = event.target.closest("[data-step]");
  if (stepButton) {
    const lesson = currentLesson();
    const order = state.stepOrders[lesson.id] || [];
    if (order.length < lesson.steps.items.length) {
      order.push(Number(stepButton.dataset.step));
      state.stepOrders[lesson.id] = order;
      state.feedback = "";
      renderPractice();
    }
    return;
  }

  const action = event.target.closest("[data-action]");
  if (action) {
    if (action.dataset.action === "start-practice") {
      startPractice();
      return;
    }
    if (action.dataset.action === "exit-practice") {
      exitPractice();
      return;
    }
    handleAction(action.dataset.action);
    return;
  }

  const matchButton = event.target.closest("[data-match-row]");
  if (matchButton) {
    const lesson = currentLesson();
    const rowIndex = Number(matchButton.dataset.matchRow);
    const option = matchButton.dataset.matchOption;
    const row = lesson.match.items[rowIndex];
    state.matchAnswers[`${lesson.id}-${rowIndex}`] = option;
    const complete = isMatchPracticeComplete(lesson);
    if (complete) markCurrentLessonMastered();
    setFeedback(
      complete
        ? "全部正确，这篇笔记已掌握。"
        : option === row.answer
          ? "正确，这个对应关系记住了。"
          : "再想想，回到原笔记对照关键词。"
    );
    renderPractice();
  }
});

content.addEventListener("input", (event) => {
  const input = event.target.closest("[data-input]");
  if (!input) return;
  state.inputAnswers[input.dataset.input] = input.value;
});

content.addEventListener("change", (event) => {
  const select = event.target.closest("[data-practice-select]");
  if (!select) return;
  state.practiceTab = select.value;
  state.activeBlankId = null;
  state.feedback = "";
  removeOptionPanel();
  content.scrollTop = 0;
  renderPractice();
});

document.querySelector(".phone").addEventListener("click", (event) => {
  const close = event.target.closest("[data-action='close-options']");
  if (close) {
    setActiveBlank(null);
    removeOptionPanel();
    return;
  }

  const option = event.target.closest("[data-option]");
  if (!option || !state.activeBlankId) return;

  const blank = findBlank(state.activeBlankId);
  state.choiceAnswers[state.activeBlankId] = option.dataset.option;
  const complete = isChoicePracticeComplete(currentLesson());
  if (complete) markCurrentLessonMastered();
  setFeedback(
    complete
      ? "全部正确，这篇笔记已掌握。"
      : option.dataset.option === blank.answer
        ? "正确，继续完成剩下的空。"
        : `再想想，这一空应围绕“${blank.answer}”。`
  );
  state.activeBlankId = null;
  removeOptionPanel();
  renderPractice();
});

function handleAction(action) {
  const lesson = currentLesson();

  if (action === "check-input") {
    const allDone = lesson.input.items.every((item) => isInputCorrect(item, state.inputAnswers[item.id] || ""));
    if (allDone) markCurrentLessonMastered();
    setFeedback(allDone ? "全对，这篇笔记已掌握。" : "还有空不稳，红色输入框需要再改。");
    renderPractice();
    return;
  }

  if (action === "clear-input") {
    lesson.input.items.forEach((item) => {
      state.inputAnswers[item.id] = "";
    });
    state.feedback = "";
    renderPractice();
    return;
  }

  if (action === "check-steps") {
    const order = state.stepOrders[lesson.id] || [];
    const correct = lesson.steps.items.every((_, index) => order[index] === index);
    if (correct) markCurrentLessonMastered();
    setFeedback(correct ? "顺序对了，这篇笔记已掌握。" : "顺序还不对，先找题目给出的确定信息。");
    renderPractice();
    return;
  }

  if (action === "reset-steps") {
    state.stepOrders[lesson.id] = [];
    state.feedback = "";
    renderPractice();
  }
}

render();
