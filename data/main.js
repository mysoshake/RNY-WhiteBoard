// main.js

// HTMLエスケープ用ヘルパー関数
function escapeHtml(unsafeText)
{
    if (typeof unsafeText !== 'string') { return ''; }
    const div = document.createElement('div');
    div.textContent = unsafeText;
    return div.innerHTML;
}

// --- グローバル変数 ---
const mathPlaceholders   = new Map(); // DOMContentLoaded内でクリア/使用
const rawCodeSnippets    = new Map(); // コードスニペット保存用 Map を追加
let rawCodeSnippetIndex  = 0;         // コードスニペット用インデックス

const BASE_COOLDOWN_MS = 10000; //最初のクールダウン時間(10 秒),
const COOLDOWN_INCREMENT_MS = 5000; //スキップごとに追加される時間(5 秒)


function checkWaitCondition(buttonElement)
{
    const waitId = buttonElement.dataset.waitId;
    const storedPasswordsStr = buttonElement.dataset.password; // エスケープされているが、比較時は生の値を期待
    const resultDisplayElement = document.getElementById(`wait-result-${waitId}`);
    let conditionMet = false;
    if (storedPasswordsStr === "")
    { // パスワードが設定されていない場合 (「次へ進む」ボタン)
        conditionMet = true;
    }
    else
    { // パスワードが設定されている場合
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
        const userEnteredPassword = userInputElement.value; // パスワードはエスケープしない生の値を比較
        const correctPasswords = storedPasswordsStr.split(',').map(pass => pass.trim());
        if (userEnteredPassword == "") // 空欄Enter
        {
            if (resultDisplayElement)
            {
                resultDisplayElement.textContent = "パスワードを入力してください。";
                resultDisplayElement.className = 'wait-gate-result result-empty';
            }
            return;
        }
        if (correctPasswords.includes(userEnteredPassword)) // 正解 Enter
        {
            conditionMet = true;
        }
        else // 非空欄で不正解 Enter
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
        // 後続のコンテンツを表示 (問題(#pb)と同じID体系とクラス名を使う)
        const sectionToReveal = document.getElementById(`reveal-after-wait-${waitId}`); // ★ID名を変更
        if (sectionToReveal)
        {
            sectionToReveal.classList.add('revealed');
        }
    
        // ボタンと入力フィールドを無効化 (あれば)
        buttonElement.disabled = true;
        const inputElement = document.getElementById(`wait-input-${waitId}`);
        if (inputElement)
        {
            inputElement.disabled = true;
        }
        saveProgress(); // ★ 進行状況を保存
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
function skipProblem(buttonElement) {
    const currentCooldown = BASE_COOLDOWN_MS + (getSkipCount() * COOLDOWN_INCREMENT_MS);
    const cooldownInSeconds = Math.round(currentCooldown / 1000);
    
    // 1. 確認メッセージを表示
    //    ユーザーが「キャンセル」を選択した場合は、以降の処理を行いません。
    if (!window.confirm(`本当にこの問題をスキップしますか？\n（次にスキップ可能になるまで約${cooldownInSeconds}秒かかります）`)) {
        return;
    }
    incrementSkipCount();

    const problemId = buttonElement.dataset.problemId;

    // 関連するDOM要素を取得
    const userInputElement = document.getElementById(`problem-input-${problemId}`);
    const resultDisplayElement = document.getElementById(`problem-result-${problemId}`);
    const sectionToReveal = document.getElementById(`reveal-after-problem-${problemId}`);
    const checkButton = document.querySelector(`button[data-problem-id="${problemId}"][onclick="checkProblemAnswer(this)"]`);
    
    if (!resultDisplayElement) { return; }

    // 「判定」ボタンのdata-answers属性から正解文字列を取得。
    const answersString = checkButton.dataset.answers;
    if (answersString) {
        // カンマで区切られた正解の中から、最初のものを取得。
        const firstAnswer = answersString.split(',')[0].trim();
        // 解答欄(input)に最初の正解を表示します。
        if (userInputElement) {
            userInputElement.value = firstAnswer;
        }
    }
    
    // スキップ処理の本体
    if (sectionToReveal) {
        sectionToReveal.classList.add('revealed');
    }
    resultDisplayElement.textContent = "この問題はスキップしました。";
    resultDisplayElement.className = 'problem-result result-skipped'; 
    

    if (userInputElement) {
        userInputElement.disabled = true;
    }
    if (checkButton) {
        checkButton.disabled = true;
    }
    
    // 進捗を保存
    saveProgress();

    // 2. クールダウン処理10秒→12秒→...と伸びる
    //    まず、ページ内にあるすべての「諦めて飛ばす」ボタンを無効化します。
    const allSkipButtons = document.querySelectorAll('.skip-button');
    allSkipButtons.forEach(btn => {
        btn.disabled = true;
    });

    // 10秒後にタイマーを設定し、未解決の問題のボタンだけを再度有効にします。
    setTimeout(() => {
        document.querySelectorAll('.skip-button').forEach(btn => {
            const pid = btn.dataset.problemId;
            const correspondingCheckButton = document.querySelector(`button[data-problem-id="${pid}"][onclick="checkProblemAnswer(this)"]`);
            
            // 対応する「判定」ボタンがまだ無効化されていない（＝問題が未解決）場合のみ、
            // 「諦めて飛ばす」ボタンを再度有効にします。
            if (correspondingCheckButton && !correspondingCheckButton.disabled) {
                btn.disabled = false;
            }
        });
        const nextCooldownInSeconds = Math.round((BASE_COOLDOWN_MS + (getSkipCount() * COOLDOWN_INCREMENT_MS)) / 1000);
        console.log(`スキップ機能のクールダウンが終了しました。次の待機時間は${nextCooldownInSeconds}秒です。`); 
    }, currentCooldown);
}

// --- 回答判定関数 ---
function checkProblemAnswer(buttonElement)
{
    const problemId = buttonElement.dataset.problemId;
    const answersString = buttonElement.dataset.answers;
    const userInputElement = document.getElementById(`problem-input-${problemId}`);
    const resultDisplayElement = document.getElementById(`problem-result-${problemId}`);
    if (!userInputElement || !resultDisplayElement) { return; }
    const userAnswer = userInputElement.value.trim();
    const correctAnswers = answersString.split(',').map(ans => ans.trim());
    resultDisplayElement.classList.remove('result-correct', 'result-incorrect', 'result-empty');
    if (userAnswer === "")
    {
        resultDisplayElement.textContent = "入力してください。";
        resultDisplayElement.classList.add('result-empty');
    }
    else if (correctAnswers.includes(userAnswer))
    {
        const wasAlreadySolved = buttonElement.disabled; // 無効化される前に確認
        resultDisplayElement.textContent = "正解！ 🎉";
        resultDisplayElement.classList.add('result-correct');
    
        if (!wasAlreadySolved) { // まだ解かれていなかった場合のみカウントアップ
            incrementCorrectProblemsCount(); // 正解数をインクリメント
        }
        const sectionToReveal = document.getElementById(`reveal-after-problem-${problemId}`);
        if (sectionToReveal)
        {
            sectionToReveal.classList.add('revealed');
        }
        buttonElement.disabled = true;
        userInputElement.disabled = true;
    } else
    {
        resultDisplayElement.textContent = "不正解です。";
        resultDisplayElement.classList.add('result-incorrect');
    }
    updateScoreDisplay(); // スコア表示を更新
    saveProgress();       // 状態を保存
}



document.addEventListener('DOMContentLoaded', () =>
{
    const sourceElement = document.getElementById('raw-src');
    const outputElement = document.getElementById('output');
    if (sourceElement && outputElement)
    {
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
        let currentParentNodeForContent = newContentFragment;
        for (let i = 0; i < originalChildren.length; i++)
        {
            const child = originalChildren[i];
            let isGateHeader = false;
            let gateType = ''; // 'problem' or 'wait'
            let gateId = null;
            if (child.matches('h2.problem'))
            {
                isGateHeader = true;
                gateType = 'problem';
                const problemIdText = child.textContent.match(/問題 (\d+):/);
                if (problemIdText && problemIdText[1]) gateId = problemIdText[1];
            } else if (child.matches('h2.wait-gate-title')) { // ★ #wt のタイトルを検出
                isGateHeader = true;
                gateType = 'wait';
                // #wt のタイトルからIDを抽出する必要がある (現在は連番のみ)
                // JavaScriptで h2.wait-gate-title を生成する際にデータ属性などでIDを埋め込むか、
                // もしくは #wt も連番タイトルにするなら、それを抽出する
                // 簡単のため、counters.wait を使って生成されたIDを想定 (例: "待機ポイント 1: タイトル")
                // 仮にタイトルに "待機ポイント X:" が入ると仮定
                const waitIdText = child.textContent.match(/ (\d+):/); // タイトル末尾の番号をIDとする (要調整)
                                                                        // もしくは、data-wait-gate-id属性をh2に付与する
                                                                        // JavaScriptの #wt のreplacementで <h2 class="wait-gate-title" data-gate-id="${currentWaitId}">
                                                                        // としておけば、 child.dataset.gateId で取れる
                // 今回は、JavaScriptの #wt の replacement で生成される h2 に data-wait-gate-id を付与する前提とする
                // (後述の #wt の replacement 関数の修正が必要)
                if (child.dataset.waitId) { // data-wait-id をh2に付与する修正を想定
                    gateId = child.dataset.waitId;
                } else { // フォールバックとしてタイトルから抽出を試みる (要調整)
                    const tempIdMatch = child.textContent.match(/\s(\d+):/); // "タイトル 1:" のような形式を仮定
                    if(tempIdMatch && tempIdMatch[1]) gateId = tempIdMatch[1];
                }
            }
            if (isGateHeader)
            {
                currentParentNodeForContent.appendChild(child); // タイトルを追加
                const expectedContainerClass = gateType === 'problem' ? 'div.problem-container' : 'div.wait-gate-container';
                if (i + 1 < originalChildren.length && originalChildren[i+1].matches(expectedContainerClass))
                {
                    const gateContainer = originalChildren[++i];
                    currentParentNodeForContent.appendChild(gateContainer);
                    if (gateId)
                    {
                        const revealSection = document.createElement('div');
                        revealSection.id = `reveal-after-${gateType}-${gateId}`; // IDにタイプを含める
                        revealSection.className = 'revealable-section';
                        currentParentNodeForContent.appendChild(revealSection);
                        currentParentNodeForContent = revealSection;
                    } else
                    {
                        console.warn(`${gateType} タイトルからIDを抽出できませんでした:`, child.textContent);
                    }
                } else
                {
                    console.warn(`h2.${gateType === 'problem' ? 'problem' : 'wait-gate-title'} の直後に ${expectedContainerClass} が見つかりませんでした:`, child);
                }
            } else
            {
                currentParentNodeForContent.appendChild(child);
            }
        }
        outputElement.innerHTML = '';
        outputElement.appendChild(newContentFragment);
    
        loadProgress();
        updateScoreDisplay();
        
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
    }
    else
    {
        if (!sourceElement)
        {
            console.error("Error : Source element with id 'raw-src' not found.");
        }
        if (!outputElement)
        {
            console.error("Error : Output element with id 'output' not found.");
        }
    }
});
