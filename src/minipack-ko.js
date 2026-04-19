/**
 * 모듈 번들러는 작은 코드 조각들을 웹에서 작동할 수 있는 큰 복잡한 코드로 변환합니다.
 * 작은 조각들은 단순한 JavaScript 파일들이며, 이들의 의존성은 모듈 시스템으로 표현됩니다.
 * (https://webpack.js.org/concepts/modules).
 *
 * 모듈 번들러는 entry file이라는 개념을 가지고 있습니다.
 * 브라우저에 몇 개의 스크립트 태그를 추가하고 실행하는 대신,
 * 번들러에게 어느 파일이 애플리케이션의 메인 파일인지 알려줍니다.
 * 이 파일은 전체 애플리케이션을 부트스트랩하는 파일입니다.
 *
 * 번들러는 entry file에서 시작하여 의존하는 파일들을 이해하려고 합니다.
 * 그런 다음, 그 파일들이 의존하는 파일들을 이해하려고 합니다.
 * 애플리케이션의 모든 모듈들이 서로 어떻게 의존하는지 파악할 때까지 계속해서 수행합니다.
 *
 * 프로젝트에 대한 이해를 dependency graph라고 합니다.
 *
 * 예를 들어, 우리는 dependency graph를 만들어 모든 모듈을 하나의 번들로 패키징하는데 사용할 예정입니다.
 *
 * 시작해봅시다 :)
 *
 * 참고: 이 예제는 매우 단순한 예제입니다. 예제를 가능한 간단하게 만들기 위해서
 * circular dependencies, caching module exports, parsing each module just once
 * 등의 경우는 생략했습니다.
 */

const fs = require("fs");
const path = require("path");
const babylon = require("babylon");
const traverse = require("babel-traverse").default;
const { transformFromAst } = require("babel-core");

let ID = 0;

// 파일 경로를 받아 파일 내용을 읽고, 의존하는 파일들을 추출하는 함수를 만듭니다.
function createAsset(filename) {
  // 파일 내용을 문자열로 읽습니다.
  const content = fs.readFileSync(filename, "utf-8");

  // 어느 파일들이 이 파일에 의존하는지 알아내기 위해, import 문자열의 내용들을 찾아봅니다.
  // 이 방법은 투박한 방법이므로, 대신에 JavaScript 파서를 사용할 것입니다.
  //
  // JavaScript 파서는 JavaScript 코드를 읽고 이해할 수 있는 도구입니다.
  // 이들은 AST(abstract syntax tree)라고 하는 더 추상적인 모델을 생성합니다.

  // AST Explorer(https://astexplorer.net)를 참고하여 AST가 어떻게 생겼는지 확인해보세요.
  //
  // AST는 우리의 코드에 대한 많은 정보를 포함합니다.
  // 우리는 이를 쿼리하여 코드가 무엇을 시도하려고 하는지 이해할 수 있습니다.
  const ast = babylon.parse(content, {
    sourceType: "module",
  });

  // 이 배열은 이 모듈이 의존하고 있는 모듈들의 상대 경로를 저장합니다.
  const dependencies = [];

  // 우리는 AST를 순회하여 이 모듈이 의존하는 모듈들을 알아내려고 합니다.
  // 이를 위해, 우리는 AST에서 모든 import 선언을 확인합니다.
  traverse(ast, {
    // EcmaScript 모듈들은 정적이기에 상대적으로 쉽습니다.
    // 변수를 import할 수 없거나 조건적으로 다른 모듈을 import할 수 없음을 의미합니다.
    // import 구문을 볼 때마다 우리는 그 값들을 의존성으로 간주할 수 있습니다.
    ImportDeclaration: ({ node }) => {
      // 우리는 의존성 배열에 우리가 import한 값을 넣습니다.
      dependencies.push(node.source.value);
    },
  });

  // 우리는 간단히 증가하는 카운터를 이 모듈에 고유한 식별자로 할당합니다.
  const id = ID++;

  // EcmaScript 모듈과 일부 브라우저에서 지원되지 않을 수 있는 다른 JavaScript 기능을 사용합니다.
  // 번들이 모든 브라우저에서 동작하도록 Babel로 트랜스파일합니다. (https://babeljs.io)
  //
  // `presets` 옵션은 Babel이 우리의 코드를 트랜스파일하는 방법을 알려주는 규칙들의 집합입니다.
  // 우리는 `babel-preset-env`를 사용하여 대부분의 브라우저에서 실행할 수 있는 코드로 트랜스파일합니다.
  const { code } = transformFromAst(ast, null, {
    presets: ["env"],
  });

  // 이 모듈에 대한 모든 정보를 반환합니다.
  return {
    id,
    filename,
    dependencies,
    code,
  };
}

// 이제 단일 모듈의 의존성을 추출할 수 있으니, 먼저 엔트리 파일의 의존성을 추출하는 것부터 시작합니다.
//
// 그다음 그 의존성들 각각의 의존성을 추출합니다. 애플리케이션의 모든 모듈과
// 서로 어떻게 의존하는지 파악할 때까지 이 과정을 반복합니다. 프로젝트에 대한
// 이런 이해를 dependency graph라고 합니다.
function createGraph(entry) {
  // 먼저 엔트리 파일을 파싱합니다.
  const mainAsset = createAsset(entry);

  // 모든 asset의 의존성을 파싱하기 위해 큐를 사용합니다.
  // 그러기 위해 엔트리 asset 하나만 담은 배열로 시작합니다.
  const queue = [mainAsset];

  // `for ... of` 루프로 큐를 순회합니다. 처음에는 큐에 asset이 하나뿐이지만,
  // 순회하면서 새 asset을 큐에 계속 넣습니다. 큐가 비면 루프가 끝납니다.
  for (const asset of queue) {
    // 각 asset은 의존하는 모듈들에 대한 상대 경로 목록을 가집니다.
    // 이 목록을 순회하면서 `createAsset()`으로 파싱하고,
    // 이 모듈이 가진 의존성 관계를 이 객체에 기록합니다.
    asset.mapping = {};

    // 이 모듈이 위치한 디렉터리입니다.
    const dirname = path.dirname(asset.filename);

    // 의존성에 대한 상대 경로 목록을 순회합니다.
    asset.dependencies.forEach((relativePath) => {
      // `createAsset()` 함수는 절대 파일 경로를 기대합니다.
      // dependencies 배열은 상대 경로들의 배열이며, 이 경로들은 이들을 import한 파일을 기준으로 합니다.
      // 부모 asset의 디렉터리 경로와 조인하면 상대 경로를 절대 경로로 바꿀 수 있습니다.
      const absolutePath = path.join(dirname, relativePath);

      // asset을 파싱하고 내용을 읽으며 의존성을 추출합니다.
      const child = createAsset(absolutePath);

      // `asset`이 `child`에 의존한다는 사실을 알아야 합니다.
      // mapping 객체에 자식의 id를 키-값으로 넣어 그 관계를 표현합니다.
      asset.mapping[relativePath] = child.id;

      // 마지막으로 자식 asset을 큐에 넣어, 그 의존성도 순회·파싱되도록 합니다.
      queue.push(child);
    });
  }

  // 이 시점에서 큐는 대상 애플리케이션의 모든 모듈을 담은 배열입니다.
  // 우리는 이렇게 그래프를 표현합니다.
  return queue;
}

// 다음으로, 그래프를 사용해 브라우저에서 실행할 수 있는 번들을 반환하는 함수를 정의합니다.
//
// 번들에는 자기 자신을 호출하는 함수가 하나만 있습니다:
//
// (function() {})()
//
// 그 함수는 매개변수 하나만 받습니다. 그래프의 모든 모듈에 대한 정보가 담긴 객체입니다.
function bundle(graph) {
  let modules = "";

  // 그 함수의 본문에 들어가기 전에, 매개변수로 넘길 객체를 만듭니다.
  // 만드는 문자열은 중괄호 두 개({})로 감싸지므로, 각 모듈마다
  // `key: value,` 형식의 문자열을 더합니다.
  graph.forEach((mod) => {
    // 그래프의 모든 모듈은 이 객체에 항목이 있습니다. 키로 모듈의 id를 쓰고,
    // 값은 배열입니다(모듈마다 값이 두 개).
    //
    // 첫 번째 값은 각 모듈의 코드를 함수로 감싼 것입니다.
    // 모듈은 스코프가 분리되어야 하므로, 한 모듈에서 변수를 정의해도
    // 다른 모듈이나 전역 스코프에 영향을 주면 안 됩니다.
    //
    // 트랜스파일한 뒤의 모듈은 CommonJS 모듈 시스템을 사용합니다.
    // `require`, `module`, `exports` 객체가 있을 것으로 기대합니다.
    // 브라우저에는 보통 없으므로, 이를 구현해 함수 래퍼 안에 주입합니다.
    //
    // 두 번째 값은 모듈과 그 의존성 사이의 매핑을 JSON 문자열로 만든 것입니다.
    // 객체 형태는 다음과 같습니다:
    // { './relative/path': 1 }.
    //
    // 트랜스파일된 모듈 코드가 상대 경로로 `require()`를 호출하기 때문입니다.
    // 이 함수가 호출될 때, 그 상대 경로가 이 모듈 기준으로 그래프의 어느 모듈에
    // 해당하는지 알 수 있어야 합니다.
    modules += `${mod.id}: [
      function (require, module, exports) {
        ${mod.code}
      },
      ${JSON.stringify(mod.mapping)},
    ],`;
  });

  // 마지막으로 자기 호출 함수의 본문을 구현합니다.
  //
  // 먼저 `require()` 함수를 만듭니다. 모듈 id를 받아 앞에서 만든 `modules` 객체에서
  // 찾습니다. 두 요소짜리 배열을 구조 분해하여 함수 래퍼와 mapping 객체를 얻습니다.
  //
  // 모듈 코드는 모듈 id 대신 상대 파일 경로로 `require()`를 호출합니다.
  // 우리의 require는 모듈 id를 기대합니다. 또 서로 다른 두 모듈이
  // 같은 상대 경로를 `require()`하지만 실제로는 다른 모듈을 가리킬 수 있습니다.
  //
  // 이를 처리하기 위해, 모듈이 require될 때 그 모듈 전용의 새 `require` 함수를 만듭니다.
  // 해당 모듈에만 쓰이며, 그 모듈의 mapping을 이용해 상대 경로를 id로 바꿉니다.
  // mapping 객체는 바로 그 모듈에 한정된 상대 경로와 모듈 id의 대응입니다.
  //
  // CommonJS에서는 모듈이 require될 때 `exports` 객체를 바꿔 값을 노출할 수 있습니다.
  // 모듈 코드가 바꾼 뒤의 `exports` 객체가 `require()` 함수의 반환값이 됩니다.
  const result = `
    (function(modules) {
      function require(id) {
        const [fn, mapping] = modules[id];

        function localRequire(name) {
          return require(mapping[name]);
        }

        const module = { exports : {} };

        fn(localRequire, module, module.exports);

        return module.exports;
      }

      require(0);
    })({${modules}})
  `;

  // 결과를 그대로 반환합니다. 완료! :)
  return result;
}

const graph = createGraph("./example/entry.js");
const result = bundle(graph);

console.log(result);
fs.mkdirSync("./lib", { recursive: true });
fs.writeFileSync("./lib/bundle.js", result);
