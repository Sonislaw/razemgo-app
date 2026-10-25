import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';

test('static accessibility roles are accepted by the installed Android renderer', () => {
  // React Native's generated TS type allows any string for accessibilityRole,
  // but Android's native setter throws for values outside this enum.
  const native = readFileSync(new URL('../node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/uimanager/ReactAccessibilityDelegate.kt', import.meta.url), 'utf8');
  const roles = new Map(['accessibilityRole', 'role'].map(prop => {
    const name = prop === 'role' ? 'Role' : 'AccessibilityRole';
    const body = native.match(new RegExp(`public enum class ${name} \\{([\\s\\S]*?)public companion object`))?.[1];
    assert.ok(body, `Could not read Android's ${name} enum`);
    return [prop, new Set([...body.matchAll(/^\s+([A-Z]+)[,;]/gm)].map(match => match[1].toLowerCase()))];
  }));
  const root = new URL('../src/', import.meta.url);
  const invalid = [];
  for (const file of readdirSync(root, { recursive: true })) {
    if (!file.endsWith('.tsx') || /\.(web|ios)\.tsx$/.test(file)) continue;
    const path = new URL(file.replaceAll('\\', '/'), root);
    const source = ts.createSourceFile(fileURLToPath(path), readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = node => {
      if (ts.isJsxAttribute(node)) {
        const prop = node.name.getText(source);
        const value = node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
        if (roles.has(prop) && value && ts.isStringLiteral(value) && !roles.get(prop).has(value.text.toLowerCase())) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          invalid.push(`${file}:${line}: ${prop}="${value.text}"`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(invalid, [], 'Unsupported roles crash native view creation on Android');
});
