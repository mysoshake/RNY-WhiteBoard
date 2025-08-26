// parser.js


const DEBUG_MODE = true; // デバッグモードを有効にするかどうか

// --- インライン命令の構造木パーサー ---

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

const inlineCommandParsers = [
    { prefix: "@bf{", type: "bf", parser: (text) => parseSingleArgContent(text, "@bf{") },
    { prefix: "@ul{", type: "ul", parser: (text) => parseSingleArgContent(text, "@ul{") },
    { prefix: "@cl{", type: "cl", parser: (text) => parseTwoArgContent(text, "@cl{") },
    { prefix: "@rb{", type: "rb", parser: (text) => parseTwoArgContent(text, "@rb{") },
    { prefix: "@rf{", type: "rf", parser: (text) => parseTwoArgContent(text, "@rf{") },
    { prefix: "@cd{", type: "cd", parser: (text) => parseTwoArgContent(text, "@cd{") }, // @cd もここでパース
    { prefix: "@im{", type: "im", parser: (text) => parseTwoArgContent(text, "@im{") }
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
                        node.link    = result.args[0];
                        node.attributes = { alt: result.args[1], width: result.args[2], height: result.args[3] };
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
function renderASTtoHTML(astNodes) {
    if (!Array.isArray(astNodes)) return '';
    return astNodes.map(node => {
        switch (node.type) {
            case "text":
                return escapeHtml(node.value);
            case "bf":
                return `<strong>${renderASTtoHTML(node.content)}</strong>`;
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
                
                return `<img href="${node.link}" alt="${renderASTtoHTML(node.attributes.alt)}" width=${node.attributes.width} height=${node.attributes.height}>`;
            default:
                console.warn("Unknown AST node type:", node.type);
                return '';
        }
    }).join('');
}

// --- processInlineMarkup 関数 ---
function processInlineMarkup(text) {
    if (typeof text !== 'string' || text.trim() === '') {
        // 元のテキストがプレーンテキストのみ、または空の場合、エスケープだけして返す
        // (プレースホルダーなどを壊さないように、ASTパーサーを通すのは @ が含まれる場合のみにするなど工夫も可能)
        // ここでは、すべてのテキストをASTパーサーに通す方針とする。
        // ただし、@ が全く含まれないテキストならASTパーサーは単一のtextノードを返すはず。
        if (!text.includes('@')) { // 簡単な最適化: @ がなければコマンドはない
             return escapeHtml(text);
        }
    }
    try {
        const ast = parseInlineToAST(text);
        return renderASTtoHTML(ast);
    } catch (e) {
        console.error("Error during inline AST parsing or rendering:", e, "Input text:", text);
        return escapeHtml(text); // エラー時はエスケープした元テキストを返す
    }
}

function parseCommandAndArguments(textLine) {
    const commandMatch = textLine.match(/^([#]{1,3}(?={)|([#@][a-zA-Z0-9_-]+))\s*/);
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
