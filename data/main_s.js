// main_s.js

// --- グローバル変数 ---
const mathPlaceholders   = new Map(); // DOMContentLoaded内でクリア/使用
const rawCodeSnippets    = new Map(); // コードスニペット保存用 Map を追加
let rawCodeSnippetIndex  = 0;         // コードスニペット用インデックス
let currentMagicPrefix = "rny_answer::";

const BASE_COOLDOWN_MS = 1000; //デフォルトのクールダウン時間(1秒),
let cooldown_ms = BASE_COOLDOWN_MS;

// HTMLエスケープ用ヘルパー関数
function escapeHtml(unsafeText)
{
    if (typeof unsafeText !== 'string') { return ''; }
    const div = document.createElement('div');
    div.textContent = unsafeText;
    return div.innerHTML;
}

// ページ全体のコンテンツ表示状態を更新する関数
function updateContentVisibility()
{
    console.log("--- 表示状態の更新を開始 ---");
    
    // 最初の未解決ゲートを見つけ、それ以降のゲートとコンテンツをすべて非表示にする
    let everythingAfterShouldBeHidden = false;
    const allGateHeaders = document.querySelectorAll('#output > h2.problem, #output > h2.wait-gate-title');

    allGateHeaders.forEach((gateHeader, index) => {
        const gateContainer = gateHeader.nextElementSibling;
        const revealSection = gateContainer ? gateContainer.nextElementSibling : null; 

        // console.log(`\n[${index + 1}番目のゲート] "${gateHeader.textContent.trim()}" を処理中`);
        // console.log(`  チェック前の状態: everythingAfterShouldBeHidden = ${everythingAfterShouldBeHidden}`);

        if (everythingAfterShouldBeHidden)
        {
            // 「最初の未解決ゲート」より後にある要素は、すべて非表示にする
            // console.log("  アクション: このゲート以降なので「非表示」にします。");
            gateHeader.style.display = 'none';
            if (gateContainer) gateContainer.style.display = 'none';
            if (revealSection && revealSection.classList.contains('revealable-section')) {
                revealSection.classList.remove('revealed');
            }
        }
        else
        {
            // 「最初の未解決ゲート」より前にある要素は、すべて表示する
            // console.log("  アクション: このゲートを「表示」します。");
            gateHeader.style.display = '';
            if (gateContainer) gateContainer.style.display = '';


            // このゲートが解決済みかチェックする
           let isSolved = true; // デフォルトは解決済みと見なす
            
            if (gateContainer) { // コンテナが存在する場合のみチェック
                const gateType = gateHeader.matches('.problem') ? 'problem' : 'wait';
                const problemIdMatch = gateHeader.textContent.match(/問題 (\d+):/);
                const gateId = (gateType === 'problem' && problemIdMatch) ? problemIdMatch[1] : gateHeader.dataset.waitId;
                
                let checkButton;
                if (gateId)
                {
                    // 各ゲートのコンテナの中から、対応するボタンを探す
                    if (gateType === 'problem')
                    {
                        checkButton = gateContainer.querySelector(`button[data-problem-id="${gateId}"][onclick="checkProblemAnswer(this)"]`);
                    }
                    else if(gateType == 'wait') // wait
                    {
                        checkButton = gateContainer.querySelector(`button[data-wait-id="${gateId}"][onclick="checkWaitCondition(this)"]`);
                    }
                    else
                    {
                        console.log(`Unknown gate type: ${gateType}`)
                    }
                }
                // ボタンが見つかり、かつdisabledでなければ「未解決」
                if (checkButton && !checkButton.disabled) {
                    isSolved = false;
                }
            }

            // console.log(`  このゲートは解決済みか？ -> ${isSolved}`);

            if (isSolved)
            {
                // このゲートが解決済みなら、後続のコンテンツを表示する
                // console.log("  結果: 解決済みなので、後続のコンテンツを表示します。");
                if (revealSection && revealSection.classList.contains('revealable-section')) {
                    revealSection.classList.add('revealed');
                }
            }
            else
            {
                // console.log("  結果: これが最初の未解決ゲートです。これ以降の全要素を非表示にするように設定します。");
                // これが最初の未解決ゲート。これ以降のループでは全てを非表示にする
                everythingAfterShouldBeHidden = true;
                // このゲート自身の後続コンテンツは非表示のままにする
                if (revealSection && revealSection.classList.contains('revealable-section')) {
                    revealSection.classList.remove('revealed');
                }
            }
        }
    });
    console.log("\n--- 表示状態の更新を終了 ---");
}

function checkWaitCondition(buttonElement)
{
    const waitId = buttonElement.dataset.waitId;
    const encodedPasswordsStr = buttonElement.dataset.password;
    const resultDisplayElement = document.getElementById(`wait-result-${waitId}`);
    let conditionMet = false;

    if (encodedPasswordsStr === "")
    {
        conditionMet = true;
    }
    else
    {
        const userInputElement = document.getElementById(`wait-input-${waitId}`);
        if (!userInputElement)
        {
            console.error(`Wait input for ID ${waitId} not found.`);
            if (resultDisplayElement)
            {
                resultDisplayElement.textContent = "エラーが発生しました。";
                resultDisplayElement.className = 'wait-gate-result result-incorrect';
            }
            return;
        }

        const userEnteredPassword = userInputElement.value;
        if (userEnteredPassword === "")
        {
            if (resultDisplayElement)
            {
                resultDisplayElement.textContent = "パスワードを入力してください。";
                resultDisplayElement.className = 'wait-gate-result result-empty';
            }
            return;
        }

        // 修正点: ユーザーの入力にプレフィックスを付けてからエンコード
        const prefixedPassword = currentMagicPrefix + userEnteredPassword;
        let encodedUserPassword = '';
        try
        {
            encodedUserPassword = btoa(unescape(encodeURIComponent(prefixedPassword)));
        }
        catch(e)
        {
            console.error("Base64エンコードに失敗:", userEnteredPassword, e);
        }

        const correctEncodedPasswords = encodedPasswordsStr.split(',').map(pass => pass.trim());

        if (correctEncodedPasswords.includes(encodedUserPassword))
        {
            conditionMet = true;
        }
        else
        {
            if (resultDisplayElement)
            {
                resultDisplayElement.textContent = "パスワードが違います。";
                resultDisplayElement.className = 'wait-gate-result result-incorrect';
            }
        }
    }

    if (conditionMet)
    {
        if (resultDisplayElement)
        {
            resultDisplayElement.textContent = "解除されました。";
            resultDisplayElement.className = 'wait-gate-result result-correct';
        }
        
        buttonElement.disabled = true;
        const inputElement = document.getElementById(`wait-input-${waitId}`);
        if (inputElement)
        {
            inputElement.disabled = true;
        }
        saveProgress();
        updateContentVisibility();
    }
}

function handleProblemInputEnter(event)
{
    if (event.key === 'Enter' || event.keyCode === 13)
        {
        event.preventDefault();
        const inputElement = event.target;
        const buttonElement = inputElement.nextElementSibling; // 「解除」ボタン
        if (buttonElement && buttonElement.tagName === 'BUTTON' && !buttonElement.disabled)
        {
            checkProblemAnswer(buttonElement);
        }
    }
}

function handleWaitInputEnter(event)
{
    if (event.key === 'Enter' || event.keyCode === 13)
    {
        event.preventDefault();
        const inputElement = event.target;
        const buttonElement = inputElement.nextElementSibling; // 「解除」ボタン
        if (buttonElement && buttonElement.tagName === 'BUTTON' && !buttonElement.disabled)
        {
            checkWaitCondition(buttonElement);
        }
    }
}
// 問題スキップ用関数
function skipProblem(buttonElement)
{
    const currentCooldown = cooldown_ms;
    const cooldownInSeconds = Math.floor(currentCooldown / 1000);
    
    const confMessage = () => {
        if(cooldownInSeconds < 1.0)
        {
            return `本当にこの問題をスキップしますか？`;
        }
        return `本当にこの問題をスキップしますか？\n（次にスキップ可能になるまで約${cooldownInSeconds}秒かかります）`;
    };
    if (!window.confirm(confMessage()))
    {
        return;
    }
    incrementSkipCount();

    const problemId = buttonElement.dataset.problemId;
    const userInputElement = document.getElementById(`problem-input-${problemId}`);
    const resultDisplayElement = document.getElementById(`problem-result-${problemId}`);
    const checkButton = document.querySelector(`button[data-problem-id="${problemId}"][onclick="checkProblemAnswer(this)"]`);

    if (!resultDisplayElement || !checkButton) { return; }

    const encodedAnswersString = checkButton.dataset.answers;
    if (encodedAnswersString)
    {
        const firstEncodedAnswer = encodedAnswersString.split(',')[0].trim();
        if (userInputElement)
        {
            try
            {
                const decodedWithPrefix = decodeURIComponent(escape(atob(firstEncodedAnswer)));
                if (decodedWithPrefix.startsWith(currentMagicPrefix))
                {
                    userInputElement.value = decodedWithPrefix.substring(currentMagicPrefix.length);
                }
                else
                {
                    userInputElement.value = decodedWithPrefix; // 古いデータ用のフォールバック
                }
            }
            catch (e)
            {
                console.error("Base64デコードに失敗:", firstEncodedAnswer, e);
                userInputElement.value = "答えの表示に失敗";
            }
        }
    }
    
    resultDisplayElement.textContent = "この問題はスキップしました。";
    resultDisplayElement.className = 'problem-result result-skipped'; 
    
    if (userInputElement) userInputElement.disabled = true;
    if (checkButton) checkButton.disabled = true;
    if (buttonElement) buttonElement.disabled = true;
    
    saveProgress();
    updateContentVisibility();
    
    const allSkipButtons = document.querySelectorAll('.skip-button');
    allSkipButtons.forEach(btn =>
    {
        btn.disabled = true;
    });

    setTimeout(() =>
    {
        document.querySelectorAll('.skip-button').forEach(btn =>
        {
            const pid = btn.dataset.problemId;
            const correspondingCheckButton = document.querySelector(`button[data-problem-id="${pid}"][onclick="checkProblemAnswer(this)"]`);
            
            if (correspondingCheckButton && !correspondingCheckButton.disabled)
            {
                btn.disabled = false;
            }
        });
        console.log(`スキップ機能のクールダウンが終了しました。`); 
    }, currentCooldown); 
}

// --- 回答判定関数 ---
function checkProblemAnswer(buttonElement)
{
    const problemId = buttonElement.dataset.problemId;
    const encodedAnswersString = buttonElement.dataset.answers;
    const userInputElement = document.getElementById(`problem-input-${problemId}`);
    const resultDisplayElement = document.getElementById(`problem-result-${problemId}`);
    if (!userInputElement || !resultDisplayElement) { return; }

    const skipButton = buttonElement.nextElementSibling;
    const userAnswer = userInputElement.value.trim();
    const prefixedUserAnswer = currentMagicPrefix + userAnswer;
    const correctEncodedAnswers = encodedAnswersString.split(',').map(ans => ans.trim());
    let encodedUserAnswer = '';
    if (userAnswer)
    {
        try
        {
            encodedUserAnswer = btoa(unescape(encodeURIComponent(prefixedUserAnswer)));
        }
        catch(e)
        {
            console.error("Base64エンコードに失敗:", userAnswer, e);
        }
    }
    
    resultDisplayElement.classList.remove('result-correct', 'result-incorrect', 'result-empty');

    if (userAnswer === "")
    {
        resultDisplayElement.textContent = "入力してください。";
        resultDisplayElement.classList.add('result-empty');
    }
    else if (correctEncodedAnswers.includes(encodedUserAnswer))
    {
        const wasAlreadySolved = buttonElement.disabled;
        resultDisplayElement.textContent = "正解！ 🎉";
        resultDisplayElement.classList.add('result-correct');
    
        if (!wasAlreadySolved)
        {
            incrementCorrectProblemsCount();
        }

        buttonElement.disabled = true;
        userInputElement.disabled = true;

        if (skipButton && skipButton.classList.contains('skip-button'))
        {
            skipButton.disabled = true;
        }
    }
    else
    {
        resultDisplayElement.textContent = "不正解です。";
        resultDisplayElement.classList.add('result-incorrect');
    }

    updateScoreDisplay();
    saveProgress();
    updateContentVisibility();
}


// メイン処理
document.addEventListener('DOMContentLoaded', () =>
{
    const sourceElement = document.getElementById('raw-src');
    const outputElement = document.getElementById('output');
    
    if (!sourceElement)
    {
        console.error("Error : Source element with id 'raw-src' not found.");
        return;
    }
    if (!outputElement)
    {
        console.error("Error : Output element with id 'output' not found.");
        return;
    }

    const rawText = sourceElement.textContent;
    let htmlContent = rawText;
    
    // --- ステップ1: 優先的なプレースホルダー化 ---
    mathPlaceholders.clear();
    let mathPlaceholderIndex = 0;
    
    rawCodeSnippets.clear();
    rawCodeSnippetIndex = 0;
    inlineCodePlaceholders.clear(); 
    inlineCodePlaceholderIndex = 0;  

    // MathJax
    htmlContent = htmlContent.replace(/\$\$(.*?)\$\$/gs, (match, latex) =>
    {
        const placeholder = `%%MATH_PLACEHOLDER_${mathPlaceholderIndex++}%%`;
        mathPlaceholders.set(placeholder, { latex: latex, type: 'display' });
        return placeholder;
    });
    htmlContent = htmlContent.replace(/\$([^\$]+?)\$/g, (match, latex) =>
    {
        const placeholder = `%%MATH_PLACEHOLDER_${mathPlaceholderIndex++}%%`;
        mathPlaceholders.set(placeholder, { latex: latex, type: 'inline' });
        return placeholder;
    });

    // 複数行コードブロック (#bg{code})
    htmlContent = htmlContent.replace(/^#bg\{code\}\{(.+?)\}\r?\n([\s\S]*?)\r?\n^#ed\{code\}/gm, (match, language, codeContent) => {
        const placeholder = `%%RAW_CODE_SNIPPET_${rawCodeSnippetIndex++}%%`;
        rawCodeSnippets.set(placeholder, { code: codeContent.trim(), language: language.trim().toLowerCase() });
        return placeholder;
    });
    // インラインコード (@cd) のプレースホルダー化
    // htmlContent = htmlContent.replace(/@cd\{(.*?)\}\{(.*?)\}/g, (match, lang, code) => {
    //     // @cd の引数もネストする可能性は低いが、念のため parseCommandAndArguments を使う手もある
    //     // が、ここでは単純な正規表現でまずプレースホルダー化する
    //     const placeholder = `%%INLINE_CODE_PLACEHOLDER_${inlineCodePlaceholderIndex++}%%`;
    //     inlineCodePlaceholders.set(placeholder, { language: lang.trim().toLowerCase(), code: code });
    //     return placeholder;
    // });

    // --- ステップ2: 既存のカスタムマークアップルール処理 ---
    const counters =
    {
        explain: 1, example: 1, practice: 1, assign: 1, problem: 1, wait: 1 
    };
    
    // state.js で管理
    let currentTotalProblems = 0; 
    
    const commandProcessors = {
        // Hタグ (引数は1つ: タイトル)
        "#": (args) => `<h1>${processInlineMarkup(args[1] || '')}</h1>`,
        "##": (args) => `<h2 class="generic-h2">${processInlineMarkup(args[1] || '')}</h2>`,
        "###": (args) => `<h3 class="generic-h3">${processInlineMarkup(args[1] || '')}</h3>`,
        "#cm": (args) => "", // コメント
        "#ex": (args) => `<h2 class="explain">説明 ${counters.explain++}: ${processInlineMarkup(args[1] || '')}</h2>`,
        "#eg": (args) => `<h2 class="example">例 ${counters.example++}: ${processInlineMarkup(args[1] || '')}</h2>`,
        "#pr": (args) => `<h2 class="practice">練習 ${counters.practice++}: ${processInlineMarkup(args[1] || '')}</h2>`,
        "#as": (args) => `<h2 class="assign">課題 ${counters.assign++}: ${processInlineMarkup(args[1] || '')}</h2>`,
        "#pb": (args) => {
            if (args.length < 4) return `<p style="color:red;">#pbエラー: 引数不足 (タイトル,問題文,解答)</p>`;
            const problemId = ++currentTotalProblems;
            counters.problem = problemId; // countersも更新しておく
            const title = processInlineMarkup(args[1]);
            const problemStatement = processInlineMarkup(args[2]).replace(/\n/g, '<br>');
            const answers = args[3].replace(/"/g, "&quot;").replace(/'/g, "&apos;");
            return `
                <h2 class="problem">問題 ${problemId}: ${title}</h2>
                <div class="problem-container" data-problem-block-id="${problemId}">
                    <div class="problem-statement">${problemStatement}</div>
                    <div class="problem-interactive">
                        <label for="problem-input-${problemId}">回答: </label>
                        <input type="text" id="problem-input-${problemId}" name="problem-input-${problemId}">
                        <button data-problem-id="${problemId}" data-answers="${answers}" onclick="checkProblemAnswer(this)">判定</button>
                        <button data-problem-id="${problemId}" onclick="skipProblem(this)" class="skip-button">諦めて飛ばす</button>
                        <span id="problem-result-${problemId}" class="problem-result"></span>
                    </div>
                </div>`;
        },
        "#wt": (args) => {
            if (args.length < 3) return `<p style="color:red;">#wtエラー: 引数不足 (タイトル,本文[,パスワード])</p>`;
            const waitId = counters.wait++;
            const title = processInlineMarkup(args[1]);
            const bodyText = processInlineMarkup(args[2]).replace(/\n/g, '<br>');
            const password = args.length > 3 ? args[3].trim() : "";
            const hasPassword = password !== "";
            const passwordForAttribute = hasPassword ? password.replace(/"/g, "&quot;").replace(/'/g, "&apos;") : "";
            let interactiveElementsHtml = '';
            if (hasPassword) {
                interactiveElementsHtml = `<label for="wait-input-${waitId}">パスワード: </label><input type="text" id="wait-input-${waitId}" name="wait-input-${waitId}"><button data-wait-id="${waitId}" data-password="${passwordForAttribute}" onclick="checkWaitCondition(this)">解除</button>`;
            } else {
                interactiveElementsHtml = `<button data-wait-id="${waitId}" data-password="" onclick="checkWaitCondition(this)">次へ進む</button>`;
            }
            return `
                <h2 class="wait-gate-title" data-wait-id="${waitId}">${title}</h2>
                <div class="wait-gate-container" data-wait-block-id="${waitId}">
                    <div class="wait-gate-body">${bodyText}</div>
                    <div class="wait-gate-interactive">${interactiveElementsHtml}<span id="wait-result-${waitId}" class="wait-gate-result"></span></div>
                </div>`;
        },
        "#MP": (args) =>
        {
            // #MP{new_prefix} の形式で呼び出された場合
            if (args.length > 1)
            {
                currentMagicPrefix = args[1]; // プレフィックスを更新
            }
            // #MP{} の場合は args[1] が空文字列 "" になるので、プレフィックスがリセットされる
            
            // このコマンドは画面には何も表示しない
            return ""; 
        },
        "#CT": (args) =>
        {
            // #CT{時間(ミリ秒)} の形式で呼び出された場合
            if (args.length > 1)
            {
                const new_cooldown_ms = parseInt(args[1], 10);
                console.log();
                if(!NaN(new_cooldown_ms))
                {
                    cooldown_ms = new_cooldown_ms;
                }
                else
                {
                    return `<p style="color:red;">#CT エラー: クールダウンの計算でエラーが発生しました。</p>`;
                }
            }
            // このコマンドは画面には何も表示しない
            return ""; 
        }
    };
    // // コードブロックのプレースホルダーがHTMLタグに変換されるようにルールを追加
    // rules.unshift(
    
    //     {
    //         regex: /%%RAW_CODE_SNIPPET_(\d+)%%/g, // コードスニペットのプレースホルダーにマッチ
    //         replacement: (match, index) =>
    //         {
    //             const snippetData = rawCodeSnippets.get(match); // placeholder全体がキー
    //             if (snippetData)
    //             {
    //                 const sanitizedLanguage = escapeHtml(snippetData.language);
    //                 const codeBlockHtmlStructure =
    //                     `<div class="code-block-wrapper"><pre class="line-numbers"><code class="language-${sanitizedLanguage}"\></span>${match}</code></pre> </div>`;
    //                     return codeBlockHtmlStructure.split('\n').map(s => s.trim()).join('');
    //             }
    //             return match; // 見つからなければそのまま
    //         }
    //     }
    // );

    // for (const rule of rules)
    // {
    //     htmlContent = htmlContent.replace(rule.regex, rule.replacement);
    // }
    // // --- 全問題数を設定 ---
    // totalProblemsCount = counters.problem - 1; // counters.problem は1から始まり、問題ごとにインクリメントされるため
    // if (totalProblemsCount < 0) totalProblemsCount = 0; // 問題が一つもない場合

    // --- ステップ3: 段落処理 ---
    const lines = htmlContent.split('\n');
    let processedHtmlLines = [];
    let paragraphBuffer = [];
    let listType = null;
    let listBuffer = [];
    let listStack = []; // 例: [{type: 'ul', level: 1}, {type: 'ol', level: 2}]

    // 行からリストアイテムの情報を抽出する
    function getListItemInfo(lineText) {
        const trimmedLine = lineText.trim();
        let match;
        if (match = trimmedLine.match(/^@([*]{1,3})\s+(.*)/)) { // @*, @**, @***
            return { type: 'ul', level: match[1].length, content: match[2].trim() };
        } else if (match = trimmedLine.match(/^@([1]{1,3})\.\s+(.*)/)) { // @1., @11., @111.
            return { type: 'ol', level: match[1].length, content: match[2].trim() };
        }
        return null;
    }

    // 指定されたレベルよりも深い、または全てのリストを閉じる
    function closeListsDeeperThan(targetLevel) {
        while (listStack.length > 0 && listStack[listStack.length - 1].level > targetLevel) {
            const list = listStack.pop();
            processedHtmlLines.push(`</li>`); // 現在のアイテムを閉じる
            processedHtmlLines.push(`</${list.type}>`);
        }
    }
    
    function flushListBuffer()
    {
        if (listBuffer.length > 0 && listType)
        {
            let listHtml = `<${listType}>`;
            for (const itemText of listBuffer)
            {
                listHtml += `<li>${processInlineMarkup(itemText)}</li>`;
            }
            listHtml += `</${listType}>`;
            processedHtmlLines.push(listHtml);
            listBuffer = [];
        }
        listType = null;
    }
    function flushParagraphBuffer()
    {
        if (paragraphBuffer.length > 0)
        {
            const paragraphText = paragraphBuffer.join('\n');
            processedHtmlLines.push(`<p>${processInlineMarkup(paragraphText).replace(/\n/g, '<br>')}</p>`);
            paragraphBuffer = [];
        }
    }

    for (const line of lines)
    {
        const trimmedLine = line.trim();
        if (trimmedLine === "")
        {
            flushListBuffer(); flushParagraphBuffer(); continue;
        }

        // プレースホルダー行、コマンド行、空行は先に処理し、リスト状態をリセット
        if (trimmedLine === "" ||
            trimmedLine.startsWith('%%RAW_CODE_SNIPPET_') ||
            trimmedLine.startsWith('%%MATH_PLACEHOLDER_') ||
            trimmedLine.startsWith('%%INLINE_CODE_PLACEHOLDER_')) {
            flushParagraphBuffer();
            closeListsDeeperThan(-1); // 全てのリストを閉じる
            if (trimmedLine !== "") processedHtmlLines.push(line); // 空行は無視、プレースホルダーは追加
            continue;
        }

        const parsedArgs = parseCommandAndArguments(trimmedLine);
        const listItemInfo = getListItemInfo(trimmedLine); // リストアイテムかどうかも先に判定

        if (parsedArgs && commandProcessors[parsedArgs[0]]) { // (1) コマンドプロセッサに定義されているコマンドの場合
            flushParagraphBuffer();
            closeListsDeeperThan(-1);
            try {
                processedHtmlLines.push(commandProcessors[parsedArgs[0]](parsedArgs));
            } catch (e) {
                console.error(`Error processing command ${parsedArgs[0]}:`, e, "Args:", parsedArgs, "OriginalLine:", line);
                processedHtmlLines.push(`<p style="color:red;">コマンドエラー: ${escapeHtml(trimmedLine)}</p>`);
            }
        } else if (parsedArgs && parsedArgs[0].startsWith('#')) { // (2) #で始まるが未定義のコマンドの場合
            flushParagraphBuffer();
            closeListsDeeperThan(-1);
            console.warn(`未定義のコマンド: ${parsedArgs[0]} (行: "${trimmedLine}")`);
            processedHtmlLines.push(`<p style="color:orange;">未定義コマンド: ${escapeHtml(trimmedLine)}</p>`);
        
        } else if (listItemInfo) { // (3) リストアイテムの場合 (コマンドではない、または未定義の@コマンドの可能性もあるが、リストを優先)
            flushParagraphBuffer(); 
            // ▼▼▼ ここからリストアイテム処理 (前回提示したロジック) ▼▼▼
            const { type: itemType, level: itemLevel, content: itemContent } = listItemInfo;
            const currentStackTop = listStack.length > 0 ? listStack[listStack.length - 1] : null;

            if (currentStackTop) {
                if (itemLevel < currentStackTop.level) {
                    closeListsDeeperThan(itemLevel -1); 
                } else if (itemLevel === currentStackTop.level && itemType !== currentStackTop.type) {
                    closeListsDeeperThan(itemLevel -1);
                } else if (itemLevel === currentStackTop.level) {
                        if (processedHtmlLines.length > 0 && processedHtmlLines[processedHtmlLines.length -1].endsWith("</li>") === false && (processedHtmlLines[processedHtmlLines.length-1].startsWith("<ul") === false && processedHtmlLines[processedHtmlLines.length-1].startsWith("<ol") === false ) ) {
                        // 既に<li>があるが、それがリスト開始タグや閉じタグでない場合、前の<li>を閉じる
                        // ただし、ネスト開始時は閉じないように注意が必要
                        }
                        // 同じレベルで同じタイプのリストアイテムが続く場合、前の<li>を閉じる
                        // ただし、それがネストを開始する直前の親アイテムでないことを確認する
                        // 簡単な方法: リストスタックのトップレベルとアイテムレベルが同じなら、前のアイテムの<li>を閉じる
                        if(listStack.length > 0 && listStack[listStack.length-1].level === itemLevel){
                            processedHtmlLines.push(`</li>`);
                        }
                }
            }
            
            while (listStack.length > 0 && listStack[listStack.length - 1].level > itemLevel) {
                    const list = listStack.pop();
                    if (!processedHtmlLines[processedHtmlLines.length-1].endsWith(`</${list.type}>`)) { // まだ閉じてなければ現在のアイテムも閉じる
                        processedHtmlLines.push(`</li>`); 
                    }
                    processedHtmlLines.push(`</${list.type}>`);
            }
            if (listStack.length > 0 && listStack[listStack.length - 1].level === itemLevel && listStack[listStack.length - 1].type !== itemType) {
                    const list = listStack.pop();
                    if (!processedHtmlLines[processedHtmlLines.length-1].endsWith(`</${list.type}>`)) {
                    processedHtmlLines.push(`</li>`);
                    }
                    processedHtmlLines.push(`</${list.type}>`);
            }

            let lastLevelInStack = listStack.length > 0 ? listStack[listStack.length - 1].level : 0;
            while (lastLevelInStack < itemLevel) {
                // 新しいリストを開始する前に、親の <li> が開いている状態にする
                // (これは、親の <li> の内容としてこの新しいリストが入るため)
                // 既に push(`<li>...`) されているので、その直後に <${itemType}> が来る
                processedHtmlLines.push(`<${itemType}>`);
                listStack.push({ type: itemType, level: lastLevelInStack + 1 });
                lastLevelInStack++;
            }
            
            processedHtmlLines.push(`<li>${processInlineMarkup(itemContent)}`);
            // ▲▲▲ リストアイテム処理ここまで ▲▲▲
        } else { // (4) 上記のいずれでもない場合 -> 通常の段落テキスト
            closeListsDeeperThan(-1); // 段落が始まる前に全てのリストを閉じる
            paragraphBuffer.push(line);
        }

    }
    flushListBuffer();
    flushParagraphBuffer();

    setTotalProblemsCount(currentTotalProblems);
    
    
    let finalHtmlString = processedHtmlLines.join('\n');

    rawCodeSnippets.forEach((snippetData, placeholder) =>{
        const placeholderRegex = new RegExp(placeholder.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1"), "g");
        const sanitizedLanguage = escapeHtml(snippetData.language);
        const escapedCode = escapeHtml(snippetData.code); // コード内容はここでエスケープ
        const codeBlockHtml = `
<div class="code-block-wrapper">
<pre class="line-numbers"><code class="language-${sanitizedLanguage}">${escapedCode}</code></pre>
</div>`;
        finalHtmlString = finalHtmlString.replace(placeholderRegex, codeBlockHtml);
    });
    // インラインコードプレースホルダーの復元
    inlineCodePlaceholders.forEach((data, placeholder) => {
        const placeholderRegex = new RegExp(placeholder.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1"), "g");
        const inlineCodeHtml = `<code class="language-${escapeHtml(data.language)}">${escapeHtml(data.code)}</code>`;
        finalHtmlString = finalHtmlString.replace(placeholderRegex, inlineCodeHtml);
    });
    mathPlaceholders.forEach((mathData, placeholder) =>
        {
        const mathJaxDelimiterStart = mathData.type === 'display' ? '\\[' : '\\(';
        const mathJaxDelimiterEnd = mathData.type === 'display' ? '\\]' : '\\)';
    
        // プレースホルダーを正規表現で安全に置換するためにエスケープ
        const placeholderRegex = new RegExp(placeholder.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1"), "g");
    
        // mathData.latex は元のTeX文字列なので、HTMLエスケープしない
        finalHtmlString = finalHtmlString.replace(
            placeholderRegex,
            `${mathJaxDelimiterStart}${mathData.latex}${mathJaxDelimiterEnd}`
        );
    });
    // --- ステップ5: HTMLの描画 ---
    outputElement.innerHTML = finalHtmlString; // HTMLを描画

    // --- ステップ6: DOM構造の変更とセクションの非表示化処理 (変更なし) ---
    const originalChildren = Array.from(outputElement.children);
    const newContentFragment = document.createDocumentFragment();
    let currentWrapper = newContentFragment; // コンテンツを追加していく現在の親要素

    for (let i = 0; i < originalChildren.length; i++)
    {
        const child = originalChildren[i];
        
        // 現在の要素が「問題」か「待機」の区切り（ゲート）か判定
        if (child.matches('h2.problem') || child.matches('h2.wait-gate-title'))
        {
            
            const gateType = child.matches('h2.problem') ? 'problem' : 'wait';
            let gateId = null;
            if (gateType === 'problem')
            {
                const match = child.textContent.match(/問題 (\d+):/);
                if(match) gateId = match[1];
            }
            else // wait
            { 
                gateId = child.dataset.waitId;
            }

            // 1. ゲートのヘッダー（h2）自体は、常に最上位に追加する
            newContentFragment.appendChild(child);

            // 2. ゲートの本体（div.problem-containerなど）も、最上位に追加する
            const expectedContainerClass = gateType === 'problem' ? '.problem-container' : '.wait-gate-container';
            if (i + 1 < originalChildren.length && originalChildren[i+1].matches(expectedContainerClass)) {
                const gateContainer = originalChildren[++i];
                newContentFragment.appendChild(gateContainer);
            } else {
                    console.warn(`ゲートのヘッダーに対応するコンテナが見つかりませんでした。`, child);
            }

            // 3. このゲートの後に続くコンテンツを格納するための新しいラッパー（div）を作成し、最上位に追加
            if (gateId) {
                const revealSection = document.createElement('div');
                revealSection.id = `reveal-after-${gateType}-${gateId}`;
                revealSection.className = 'revealable-section';
                newContentFragment.appendChild(revealSection);
                
                // これ以降に見つかる「通常のコンテンツ」は、この新しいラッパーの中に入れる
                currentWrapper = revealSection;
            }

        } else {
            // ゲート以外の通常のコンテンツは、現在のラッパーに追加する
            currentWrapper.appendChild(child);
        }
    }
    outputElement.innerHTML = '';
    outputElement.appendChild(newContentFragment);

    loadProgress();
    updateScoreDisplay();
    updateContentVisibility(); // 表示更新
    
    // --- 各問題の解答入力欄にEnterキーのイベントリスナーを登録 ---
    const problemInputs = outputElement.querySelectorAll('.problem-interactive input[type="text"]');
    problemInputs.forEach(input =>
    {
        input.addEventListener('keydown', handleProblemInputEnter);
    });
    const waitInputs = outputElement.querySelectorAll('.wait-gate-interactive input[type="text"]');
    waitInputs.forEach(input =>
    {
        input.addEventListener('keydown', handleWaitInputEnter);
    });
    
    const scoreCounterElement = document.getElementById('score-counter');
    if (scoreCounterElement)
    {
        scoreCounterElement.addEventListener('click', handleScoreAreaClick);
    }
    // --- イベントリスナー登録ここまで ---

    // --- ステップ7: MathJaxの実行 ---
    if (typeof window.MathJax !== 'undefined')
    {
        if (window.MathJax.typesetPromise)
        { // MathJax 3.x
            window.MathJax.typesetPromise([outputElement])
                .catch((err) => console.error('MathJax typesetPromise failed:', err));
        }
        else if (window.MathJax.Hub)
        { // MathJax 2.x
            window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub, outputElement]);
        }
    }
    else
    {
        console.warn("MathJax library is not loaded.");
    }
    // ▼▼▼ MathJax実行の後にPrism.jsのハイライト処理を追加 ▼▼▼
    if (typeof window.MathJax !== 'undefined')
    {
        if (window.MathJax.typesetPromise)
        {
            window.MathJax.typesetPromise([outputElement])
                .then(() =>
                {
                    // MathJaxの処理が終わった後にPrismを実行
                    if (typeof window.Prism !== 'undefined')
                    {
                        window.Prism.highlightAllUnder(outputElement);
                    }
                })
                .catch((err) => console.error('MathJax typesetPromise failed:', err));
        }
        else if (window.MathJax.Hub)
        { // MathJax 2.x
            window.MathJax.Hub.Queue(
                ["Typeset", window.MathJax.Hub, outputElement],
                () =>
                { // MathJaxの処理が終わった後にPrismを実行するコールバック
                    if (typeof window.Prism !== 'undefined')
                    {
                        window.Prism.highlightAllUnder(outputElement);
                    }
                }
            );
        }
    }
    else
    { // MathJaxがない場合は直接Prismを実行
        if (typeof window.Prism !== 'undefined')
        {
            window.Prism.highlightAllUnder(outputElement);
        }
        console.warn("MathJax library is not loaded.");
    }

});
