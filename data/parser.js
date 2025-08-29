// parser.js (v3.0)

const DEBUG_MODE = true;

// =======================================================================
// 1. メインの変換関数
// =======================================================================

/**
 * 生のマークダウンテキストを受け取り、HTML文字列とメタデータを返すエントリーポイント
 * @param {string} rawText - <pre>タグから取得した生のテキスト
 * @returns {{html: string, totalProblems: number, visibilityModes: object, initialPrefix: string}}
 */
function parseMarkdownToHTML(rawText)
{
    // この関数内でのみ使用する、解析中の状態を管理する変数
    let currentSourceDirectory = "";
    let currentMagicPrefix = "rny_answer::";
    const gateVisibilityModes = { problem: 'hide', wait: 'hide' };
    const counters = { problem: 0, wait: 0, ex: 1, eg: 1, pr: 1, as: 1 };
    
    let currentCooldownForProblems = BASE_COOLDOWN_MS;
    
    // インラインマークアップ処理用の関数を定義。現在の状態を引き継ぐ。
    const processInline = (text) => processInlineMarkup(text, { srcDir: currentSourceDirectory });
    
    const getListItemInfo = (lineText) =>
    {
        const trimmedLine = lineText.trim();
        let match;
        
        // 箇条書きリスト (@*., @**., ...)
        if (match = trimmedLine.match(/^@([*]{1,5})\.\s+(.*)/))
        {
            return { style: 'disc', type: 'ul', level: match[1].length, content: match[2].trim() };
        }
        
        // 番号付きリスト (@1., @i., @A., @あ. ...)
        const olMatch = trimmedLine.match(/^@([1iIいイaAあア一壱]{1,5})\.\s+(.*)/);
        if (olMatch)
        {
            const marker = olMatch[1];
            const level = marker.length;
            const firstChar = marker[0];
            
            // CSSの list-style-type に対応するスタイルを決定
            const styleMap = {
                '1': 'decimal',
                'i': 'lower-roman',
                'I': 'upper-roman',
                'a': 'lower-alpha',
                'A': 'upper-alpha',
                'あ': 'hiragana',
                'い': 'hiragana-iroha',
                'ア': 'katakana',
                'イ': 'katakana-iroha',
                '一': 'cjk-ideographic',
                '壱': 'disclosure-open' // 伝統的な漢数字はCSS標準にないため、代替スタイル
            };
            
            return { style: styleMap[firstChar] || 'decimal', type: 'ol', level: level, content: olMatch[2].trim() };
        }

        return null;
    };    
    // --- ブロックコマンドの処理内容を定義 ---
    const commandProcessors = {
        "#"     : (args) => `<h1>${processInline(args[1] || '')}</h1>`,
        "##"    : (args) => `<h2 class="generic-h2">${processInline(args[1] || '')}</h2>`,
        "###"   : (args) => `<h3 class="generic-h3">${processInline(args[1] || '')}</h3>`,
        "####"  : (args) => `<h4 class="generic-h4">${processInline(args[1] || '')}</h4>`,
        "#####" : (args) => `<h5 class="generic-h5">${processInline(args[1] || '')}</h5>`,
        "######": (args) => `<h6 class="generic-h6">${processInline(args[1] || '')}</h6>`,
        "#cm": (args) => "",
        "#ex": (args) => `<h2 class="explain">説明 ${counters.ex++}: ${processInline(args[1] || '')}</h2>`,
        "#eg": (args) => `<h2 class="example">例 ${counters.eg++}: ${processInline(args[1] || '')}</h2>`,
        "#pr": (args) => `<h2 class="practice">練習 ${counters.pr++}: ${processInline(args[1] || '')}</h2>`,
        "#as": (args) => `<h2 class="assign">課題 ${counters.as++}: ${processInline(args[1] || '')}</h2>`,
        "#MP": (args) =>
        {
            currentMagicPrefix = (args.length > 1) ? args[1] : "";
            return "";
        },
        "#SC": (args) =>
        {
            let path = (args.length > 1) ? args[1].trim() : "";
            if (path && !path.endsWith('/')) { path += '/'; }
            currentSourceDirectory = path;
            return "";
        },
        "#ST": (args) =>
        {
            if (args.length >= 3)
            {
                const type = args[1].toLowerCase().replace('pb', 'problem').replace('wt', 'wait');
                const mode = args[2].toLowerCase();
                if (Object.prototype.hasOwnProperty.call(gateVisibilityModes, type))
                {
                    gateVisibilityModes[type] = mode;
                }
            }
            else if (args.length === 2)
            {
                const mode = args[1].toLowerCase();
                if (mode === 'show' || mode === 'hide')
                {
                    return `<div class="visibility-marker" data-mode="${mode}"></div>`;
                }
            }
            return "";
        },
        "#CT": (args) =>
        {
            // #CT{時間(ミリ秒)} の形式で呼び出された場合
            if (args.length > 1)
            {
                const new_cooldown_ms = parseInt(args[1], 10);
                console.log();
                if(!isNaN(new_cooldown_ms))
                {
                    cooldown_ms = new_cooldown_ms;
                    currentCooldownForProblems = new_cooldown_ms;
                }
                else
                {
                    return `<p style="color:red;">#CT エラー: クールダウンの計算でエラーが発生しました。</p>`;
                }
            }
            // このコマンドは画面には何も表示しない
            return ""; 
        },
        "#pb": (args) => createProblemHTML(args, { isSubProblem: false, counters, processInline, cooldown: currentCooldownForProblems }),
        "##pb": (args) => createProblemHTML(args, { isSubProblem: true, counters, processInline, cooldown: currentCooldownForProblems }),
        "#wt": (args) => createWaitGateHTML(args, { counters, processInline }),
        "#bg": (args, rawContent) => createCodeBlockHTML(args, rawContent)
    };

    // --- メイン解析ループ ---
    const lines = rawText.split('\n');
    let processedHtmlLines = [];
    let paragraphBuffer = [];
    let listStack = [];
    let inCodeBlock = false;
    let codeBlockLang = '';
    let codeBlockContent = [];
    let inListBlock = false;
    
    const flushParagraphBuffer = () =>
    {
        if (paragraphBuffer.length > 0)
        {
            const paragraphText = paragraphBuffer.join('\n');
            processedHtmlLines.push(`<p>${processInline(paragraphText).replace(/\n/g, '<br>')}</p>`);
            paragraphBuffer = [];
        }
    };
    
    const closeListsDeeperThan = (targetLevel) => {
        let nextTopLevelStyle = null;
        while (listStack.length > 0 && listStack[listStack.length - 1].level > targetLevel) {
            const list = listStack.pop();
            if (DEBUG_MODE) console.log(`[LIST] 閉じ (${list.style} of ${list.type})レベル:${list.level}`);
            processedHtmlLines.push(`</li></${list.type}>`);
            if (listStack.length > 0) nextTopLevelStyle = listStack[listStack.length - 1].style;
        }
        return nextTopLevelStyle;
    };
    
    for (const line of lines)
    {
        
        if (inCodeBlock)
        {
            if (line.trim() === '#ed{code}')
            {
                processedHtmlLines.push(commandProcessors['#bg'](['#bg', codeBlockLang], codeBlockContent.join('\n')));
                inCodeBlock = false;
                codeBlockContent = [];
            }
            else
            {
                codeBlockContent.push(line);
            }
            continue;
        }
        
        const trimmedLine = line.trim();
        
        if (trimmedLine === "#bg{list}")
        {
            flushParagraphBuffer();
            closeListsDeeperThan(-1);
            inListBlock = true;
            continue;
        }
        if (trimmedLine === "#ed{list}")
        {
            flushParagraphBuffer();
            closeListsDeeperThan(-1);
            inListBlock = false;
            continue;
        }
        
        if (trimmedLine === "")
        {
            flushParagraphBuffer();
            if (!inListBlock) {
                closeListsDeeperThan(-1);
            }
            continue;
        }
        
        const bgMatch = trimmedLine.match(/^#bg\{code\}\{(.*?)\}/);
        if (bgMatch)
        {
            flushParagraphBuffer();
            closeListsDeeperThan(-1);
            inCodeBlock = true;
            codeBlockLang = bgMatch[1];
            continue;
        }

        const args = parseCommandAndArguments(trimmedLine);
        const listItemInfo = getListItemInfo(trimmedLine);
        
        if (!listItemInfo && !inListBlock)
        {
            closeListsDeeperThan(-1);
        }
        
        if (args && commandProcessors[args[0]])
        {
            flushParagraphBuffer();
            if (!inListBlock) {
                closeListsDeeperThan(-1);
            }
            processedHtmlLines.push(commandProcessors[args[0]](args));
        }
        else if (listItemInfo)
        {
            flushParagraphBuffer();
            const { style: itemStyle, type: itemType, level: itemLevel, content: itemContent } = listItemInfo;
            const currentStackTop = listStack.length > 0 ? listStack[listStack.length - 1] : null;
            
            if (currentStackTop)
            {
                if (itemLevel < currentStackTop.level)
                {
                    const currentStyle = closeListsDeeperThan(itemLevel);
                    if (currentStyle !== itemStyle)
                    {
                        closeListsDeeperThan(itemLevel - 1);
                    }
                }
                else if (itemLevel === currentStackTop.level && itemStyle !== currentStackTop.style)
                {
                    closeListsDeeperThan(itemLevel - 1);
                }
                else if (itemLevel === currentStackTop.level)
                {
                    processedHtmlLines.push(`</li>`);
                }
            }
            let lastLevelInStack = listStack.length > 0 ? listStack[listStack.length - 1].level : 0;
            while (lastLevelInStack < itemLevel)
            {
                const listTag = (typ) => {
                    if (typ === 'ol') {
                        return `<ol style="list-style-type: ${itemStyle};">`;
                    }
                    else {
                        return `<${typ}>`;
                    }
                };
                processedHtmlLines.push(listTag(itemType));
                
                const nextListItem = { type: itemType, style: itemStyle, level: ++lastLevelInStack };
                listStack.push(nextListItem);
            }
            if (DEBUG_MODE) console.log(`[LIST] 要素 (${itemType}) "${itemContent}"`);
            processedHtmlLines.push(`<li>${processInline(itemContent)}`);
        }
        else
        {
            paragraphBuffer.push(line);
        }
    }
    flushParagraphBuffer();
    closeListsDeeperThan(-1);

    return {
        html: processedHtmlLines.join('\n'),
        totalProblems: counters.problem,
        visibilityModes: gateVisibilityModes,
        initialPrefix: currentMagicPrefix
    };
}

// =======================================================================
// 2. ブロック要素生成ヘルパー
// =======================================================================

function createProblemHTML(args, options)
{
    if (args.length < 4) { return `<p style="color:red;">問題エラー: 引数不足</p>`; }
    const problemId = ++options.counters.problem;
    const title = options.processInline(args[1]);
    const statement = options.processInline(args[2]).replace(/\n/g, '<br>');
    const answers = args[3].replace(/"/g, "&quot;");

    const headerTag = options.isSubProblem ? 'h3' : 'h2';
    const headerClass = `problem ${options.isSubProblem ? 'sub-problem' : ''}`;
    const containerClass = `problem-container ${options.isSubProblem ? 'sub-problem-container' : ''}`;
    const headerContent = `${options.isSubProblem ? '└ ' : ''}問題 ${problemId}: ${title}`;
    const cooldown = options.cooldown || BASE_COOLDOWN_MS;

    return `
        <${headerTag} class="${headerClass}">${headerContent}</${headerTag}>
        <div class="${containerClass}" data-problem-block-id="${problemId}">
            <div class="problem-statement">${statement}</div>
            <div class="problem-interactive">
                <label for="problem-input-${problemId}">回答: </label>
                <input type="text" id="problem-input-${problemId}" name="problem-input-${problemId}">
                <button data-problem-id="${problemId}" data-answers="${answers}" onclick="checkProblemAnswer(this)">判定</button>
                <button data-problem-id="${problemId}" onclick="skipProblem(this)" class="skip-button" data-cooldown="${cooldown}">諦めて飛ばす</button>
                <span id="problem-result-${problemId}" class="problem-result"></span>
            </div>
        </div>`;
}

function createWaitGateHTML(args, options)
{
    if (args.length < 3) { return `<p style="color:red;">#wtエラー: 引数不足</p>`; }
    const waitId = ++options.counters.wait;
    const title = options.processInline(args[1]);
    const bodyText = options.processInline(args[2]).replace(/\n/g, '<br>');
    const password = args.length > 3 ? args[3].trim() : "";
    const passwordForAttr = password.replace(/"/g, "&quot;");
    
    let interactiveEl = `<button data-wait-id="${waitId}" data-password="" onclick="checkWaitCondition(this)">次へ進む</button>`;
    if (password)
    {
        interactiveEl = `<label for="wait-input-${waitId}">パスワード: </label><input type="text" id="wait-input-${waitId}" name="wait-input-${waitId}"><button data-wait-id="${waitId}" data-password="${passwordForAttr}" onclick="checkWaitCondition(this)">解除</button>`;
    }
    
    return `<h2 class="wait-gate-title" data-wait-id="${waitId}">${title}</h2>
        <div class="wait-gate-container" data-wait-block-id="${waitId}">
            <div class="wait-gate-body">${bodyText}</div>
            <div class="wait-gate-interactive">${interactiveEl}<span id="wait-result-${waitId}" class="wait-gate-result"></span></div>
        </div>`;
}

function createCodeBlockHTML(args, rawContent)
{
    if (args.length < 2) return '';
    const lang = args[1].toLowerCase();
    return `<div class="code-block-wrapper"><pre class="line-numbers"><code class="language-${lang}">${escapeHtml(rawContent)}</code></pre></div>`;
}


// =======================================================================
// 3. インライン要素解析ヘルパー
// =======================================================================

function parseZeroArgContent(text, prefix) {
    if (!text.startsWith(prefix)) return null;
    let argStart = prefix.length;
    return { args: [], consumedLength: argStart };
}

/**
 * 単一引数を取るコマンドの引数内容と消費長を抽出するヘルパー
 * 例: @bf{content} -> { args: ["content"], consumedLength: total_length_of_@bf{content} }
 */
function parseSingleArgContent(text, prefix) {
    if (!text.startsWith(prefix)) return null;
    let argStart = prefix.length;
    let braceLevel = 1;
    for (let k = argStart; k < text.length; k++) {
        if (text[k] === '{') braceLevel++;
        else if (text[k] === '}') braceLevel--;
        if (braceLevel === 0) { // 引数の終わり
            return { args: [text.substring(argStart, k)], consumedLength: k + 1 };
        }
    }
    return null; // 閉じ括弧不一致
}

/**
 * 二重引数を取るコマンドの引数内容と消費長を抽出するヘルパー
 * 例: @cl{color}{content} -> { args: ["color", "content"], consumedLength: total_length }
 */
function parseTwoArgContent(text, prefix) {
    if (!text.startsWith(prefix)) return null;
    let arg1Start = prefix.length;
    let braceLevel = 1;
    let arg1End = -1;
    let arg1 = "";

    for (let k = arg1Start; k < text.length; k++) {
        if (text[k] === '{') braceLevel++;
        else if (text[k] === '}') braceLevel--;
        if (braceLevel === 0) {
            arg1 = text.substring(arg1Start, k);
            arg1End = k;
            break;
        }
    }
    // 第1引数が正しく閉じられ、次に '{' が続くか
    if (arg1End === -1 || (arg1End + 1 >= text.length || text[arg1End + 1] !== '{') ) {
         return null;
    }

    let arg2Start = arg1End + 2; // '}{' の後
    braceLevel = 1;
    let arg2 = "";
    for (let k = arg2Start; k < text.length; k++) {
        if (text[k] === '{') braceLevel++;
        else if (text[k] === '}') braceLevel--;
        if (braceLevel === 0) {
            arg2 = text.substring(arg2Start, k);
            return { args: [arg1, arg2], consumedLength: k + 1 };
        }
    }
    return null; // 第2引数の閉じ括弧不一致
}

/**
 * 引数Nつ取るコマンドの引数内容と消費長を抽出するヘルパー
 * 例: @cl{color}{content} -> { args: ["color", "content"], consumedLength: total_length }
 */
function parseNArgContent(text, prefix, arglen) {
    // 先頭が正しいコマンド名でないなら null を返す
    if (!text.startsWith(prefix)) return null;
    
    // 各種変数設定
    let argHead = prefix.length;
    let argEnd = -1;
    let braceLevel = 1;
    let argslist = [];
    let k = 0;
    
    for (let n = 0; n < arglen; n++) {
        ARG_LOOP: for (k = argHead; k < text.length; k++) {
            
            if (text[k] === '{') braceLevel++;
            else if (text[k] === '}') braceLevel--;
            
            if (braceLevel === 0) {
                argslist.push(text.substring(argHead, k));
                argEnd = k;
                break ARG_LOOP;
            }   
        }
        
        // 最後の引数なら終了
        if (n === arglen - 1) break;
        
        // 第n引数が正しく閉じられ、次に '{' が続くか
        //// {.*}が見つからない or textに続きがない or 次の文字が { ではない　→　終了
        if (argEnd === -1 || (argEnd + 1 >= text.length || text[argEnd + 1] !== '{') ) return null;
        
        // 次の引数の準備
        argHead = argEnd + 2; // '}{' の後
        argEnd = -1;
        braceLevel = 1;
    }
    if (DEBUG_MODE) console.log("[PCA] Extract args: ", argslist);
    
    return { args: argslist, consumedLength: k + 1 };
}

function parseCommandAndArguments(textLine) {
    const commandMatch = textLine.match(/^([#]{1,6}(?={)|([#@][a-zA-Z0-9_-]+))\s*/);
    if (!commandMatch) {
        return null;
    }
    if(DEBUG_MODE)
    {
        console.log(`[PCA] Parsing command: ${commandMatch[1]} in line: ${textLine.substring(0, 100)}`);
    }
    const command = commandMatch[1];
    const argsArray = [command];
    let currentPos = commandMatch[0].length;
    while (currentPos < textLine.length) {
        if (textLine[currentPos] !== '{') {
            if (argsArray.length === 1 && textLine.substring(currentPos).trim() === "") {
                return argsArray;
            }
            break;
        }
        currentPos++;
        let argumentContent = "";
        let braceLevel = 1;
        const argumentStartPos = currentPos;
        while (currentPos < textLine.length) {
            const char = textLine[currentPos];
            if (char === '{') braceLevel++;
            else if (char === '}') braceLevel--;
            if (braceLevel === 0) {
                argumentContent = textLine.substring(argumentStartPos, currentPos);
                argsArray.push(argumentContent);
                currentPos++;
                break;
            }
            currentPos++;
        }
        if (braceLevel !== 0) {
            console.warn(`[PCA] Unbalanced braces for '${command}'. Line: ${textLine.substring(0, 100)}`);
            return null;
        }
    }
    return argsArray;
}


const inlineCommandParsers = [
    { prefix: "@br" , type: "br", parser: (text) => parseZeroArgContent(text, "@br") },
    { prefix: "@bf{", type: "bf", parser: (text) => parseSingleArgContent(text, "@bf{") },
    { prefix: "@ul{", type: "ul", parser: (text) => parseSingleArgContent(text, "@ul{") },
    { prefix: "@cl{", type: "cl", parser: (text) => parseTwoArgContent(text, "@cl{") },
    { prefix: "@rb{", type: "rb", parser: (text) => parseTwoArgContent(text, "@rb{") },
    { prefix: "@rf{", type: "rf", parser: (text) => parseTwoArgContent(text, "@rf{") },
    { prefix: "@cd{", type: "cd", parser: (text) => parseTwoArgContent(text, "@cd{") }, // @cd もここでパース
    { prefix: "@im{", type: "im", parser: (text) => parseNArgContent(text, "@im{", 4) }
];

/**
 * テキストをスキャンし、インライン命令とプレーンテキストのノード配列（AST）を生成する
 * @param {string} text 解析対象のテキスト
 * @returns {Array<Object>} ノードの配列
 */
function parseInlineToAST(text) {
    const nodes = [];
    let currentPosition = 0;

    while (currentPosition < text.length) {
        let commandFoundInIteration = false;
        // 現在位置から始まるコマンドを探す
        for (const cmdParser of inlineCommandParsers) {
            if (text.substring(currentPosition).startsWith(cmdParser.prefix)) {
                const result = cmdParser.parser(text.substring(currentPosition));
                if (result) { // コマンドとして正しくパースできた
                    let node = { type: cmdParser.type };
                    if (cmdParser.type === "cl") {
                        node.attributes = { color: result.args[0] }; // 生の色の文字列
                        node.content = parseInlineToAST(result.args[1]); // 内容を再帰的にパース
                    } else if (cmdParser.type === "rb") {
                        node.base = parseInlineToAST(result.args[0]);    // 親文字を再帰パース
                        node.ruby = parseInlineToAST(result.args[1]); // ルビ文字を再帰パース (通常は単純なテキストだが念のため)
                    } else if (cmdParser.type === "rf") {
                        node.content = parseInlineToAST(result.args[0]); // 再帰パース（ただのテキストのはず）
                        node.link    = result.args[1];                   // リンク部分はそのまま
                    } else if (cmdParser.type === "cd") {
                        node.attributes = { language: result.args[0].trim().toLowerCase() };
                        node.content = [{ type: "text", value: result.args[1] }]; // コード内容はそのままテキストノードとして扱う
                    } else if (cmdParser.type === "im") {
                        node.attributes = { src: result.args[0], alt: result.args[1], width: result.args[2], height: result.args[3] };
                    } else if (cmdParser.type === "br") {
                        node.content = [];
                    } else { // bf, ul
                        node.content = parseInlineToAST(result.args[0]); // 内容を再帰的にパース
                    }
                    nodes.push(node);
                    currentPosition += result.consumedLength;
                    commandFoundInIteration = true;
                    break; // この位置でのコマンド処理は終了、次の位置へ
                }
            }
        }

        if (!commandFoundInIteration) {
            // コマンドが見つからなかった場合、次のコマンドの開始位置 '@' までをテキストノードとする
            // または文字列の最後までをテキストノードとする
            let nextAt = text.indexOf('@', currentPosition);
            if (nextAt === -1) { // もう '@' はない
                if (currentPosition < text.length) {
                    nodes.push({ type: "text", value: text.substring(currentPosition) });
                }
                break; // 解析終了
            } else if (nextAt > currentPosition) { // '@' までの間にテキストがある
                nodes.push({ type: "text", value: text.substring(currentPosition, nextAt) });
                currentPosition = nextAt;
                // ループの次のイテレーションで '@' から始まるコマンドの解析を試みる
            } else { // nextAt === currentPosition、つまり現在の位置が '@'
                // この '@' から始まる有効なコマンドが見つからなかった場合、'@' を通常の文字として扱う
                nodes.push({ type: "text", value: text[currentPosition] });
                currentPosition++;
            }
        }
    }
    return nodes;
}

/**
 * ASTノード配列をHTML文字列に変換する
 * @param {Array<Object>} astNodes ノードの配列
 * @returns {string} 生成されたHTML文字列
 */
function renderASTtoHTML(astNodes, options = {}) {
    if (!Array.isArray(astNodes)) return '';
    const srcDir = options.srcDir || "";
    return astNodes.map(node => {
        switch (node.type) {
            case "text":
                return escapeHtml(node.value);
            case "br":
                return `<br>`;
            case "bf":
                return `<strong>${renderASTtoHTML(node.content, options)}</strong>`;
            case "ul":
                return `<span style="text-decoration:underline;">${renderASTtoHTML(node.content)}</span>`;
            case "cl":
                const color = node.attributes && node.attributes.color ? escapeHtml(node.attributes.color.trim()).replace(/['";()]/g, '') : 'inherit';
                return `<span style="color:${color};">${renderASTtoHTML(node.content)}</span>`;
            case "rb":
                return `<ruby>${renderASTtoHTML(node.base)}<rt>${renderASTtoHTML(node.ruby)}</rt></ruby>`;
            case "rf":
                return `<a href="${node.link}" target="_blank" rel="noopener noreferrer">${renderASTtoHTML(node.content)}</a>`;
            case "cd":
                const lang = node.attributes && node.attributes.language ? escapeHtml(node.attributes.language) : '';
                // node.content は [{ type: "text", value: "code" }] の形を想定
                const code = node.content && node.content[0] && node.content[0].type === "text" ? escapeHtml(node.content[0].value) : '';
                return `<code class="language-${lang}">${code}</code>`;
            case "im":
                let src = node.attributes.src;
                if (srcDir && !/^(https|http|\/|\.\/)/.test(src))
                {
                    src = escapeHtml(srcDir + src);
                }
                const alt = escapeHtml(node.attributes.alt);
                const width = escapeHtml(node.attributes.width);
                const height = escapeHtml(node.attributes.height);
                return `<img src="${src}" alt="${alt}" width=${width} height=${height}>`;
            default:
                console.warn("Unknown AST node type:", node.type);
                return '';
        }
    }).join('');
}

// --- processInlineMarkup 関数 ---
function processInlineMarkup(text, options = {}) {
    // 元のテキストがプレーンテキストのみ、または空の場合、エスケープだけして返す
    if (typeof text !== 'string' || text.trim() === '' || !text.includes('@')) {
        return escapeHtml(text);
    }
    
    try {
        const ast = parseInlineToAST(text);
        return renderASTtoHTML(ast, options);
    } catch (e) {
        console.error("Error during inline AST parsing or rendering:", e, "Input text:", text);
        return escapeHtml(text); 
    }
}