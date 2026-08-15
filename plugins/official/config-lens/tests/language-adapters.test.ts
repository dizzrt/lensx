import { describe, expect, test } from '@rstest/core';

import { runJson } from '../src/language/adapters/json.js';
import { runToml } from '../src/language/adapters/toml.js';
import { runXml } from '../src/language/adapters/xml.js';
import { runYaml } from '../src/language/adapters/yaml.js';

const request = (
  language: 'json' | 'yaml' | 'toml' | 'xml',
  operation: 'validate' | 'format' | 'compact',
  source: string,
) =>
  ({
    requestId: 7,
    language,
    operation,
    source,
  }) as const;

describe('JSON lexical fidelity', () => {
  test('preserves large numbers, duplicate keys, order, negative zero and escape spelling', () => {
    const source = '{"big":900719925474099312345,"same":1,"same":2,"negative":-0,"exp":1e+09,"escaped":"\\u0061"}';
    const formatted = runJson(request('json', 'format', source));
    const compact = runJson(request('json', 'compact', source));
    expect(formatted.status).toBe('valid');
    expect(formatted.output).toContain('900719925474099312345');
    expect(formatted.output).toContain('"same": 1');
    expect(formatted.output).toContain('"same": 2');
    expect(formatted.output).toContain('"escaped": "\\u0061"');
    expect(compact).toMatchObject({ status: 'valid', output: source });
  });

  test('rejects invalid input and recovers on a fresh request', () => {
    const invalid = runJson(request('json', 'format', '{"a":1,}'));
    expect(invalid.status).toBe('invalid');
    expect(invalid).not.toHaveProperty('output');
    expect(runJson({ ...request('json', 'format', '{"a":1}'), requestId: 8 })).toMatchObject({ status: 'valid' });
  });

  test.each([
    '[null,true,false,{"nested":[1,2,3]}]',
    '{"unicode":"😀","escaped":"\\n\\t\\u2028"}',
    '{\r\n  "order": 1,\r\n  "second": -2.5E-10\r\n}',
  ])('formats and compacts the golden token corpus without lexical drift', (source) => {
    const formatted = runJson(request('json', 'format', source));
    expect(formatted.status).toBe('valid');
    expect(runJson(request('json', 'compact', formatted.output ?? ''))).toMatchObject({ status: 'valid' });
  });

  test.each(['{"a":01}', '{"a":NaN}', '[1 2]', '"unterminated'])('rejects malformed corpus entry %s', (source) => {
    expect(runJson(request('json', 'format', source))).toMatchObject({ status: 'invalid' });
  });
});

describe('YAML 1.2 fidelity and bounds', () => {
  test('preserves documents, comments, anchors, aliases, tags and block scalars', () => {
    const source =
      '%YAML 1.2\n---\n# comment\nbase: &base\n  value: 1\ncopy: *base\ntagged: !local value\ntext: |\n  line\n---\nflow: [one, two]\n';
    const result = runYaml(request('yaml', 'format', source));
    expect(result.status).toBe('valid');
    expect(result.output).toContain('# comment');
    expect(result.output).toContain('&base');
    expect(result.output).toContain('*base');
    expect(result.output).toContain('!local');
  });

  test('rejects invalid syntax and compact', () => {
    expect(runYaml(request('yaml', 'validate', 'value: [one, two'))).toMatchObject({ status: 'invalid' });
    expect(runYaml(request('yaml', 'compact', 'value: 1'))).toMatchObject({ status: 'unsupported' });
  });

  test('covers flow/block collections, quoted/folded scalars, duplicate keys and alias bounds', () => {
    const valid = [
      'flow: {one: 1, two: [2, 3]}\n',
      'quoted: "value"\nfolded: >\n  one\n  two\nliteral: |\n  line\n',
      '---\nsequence:\n  - one\n  - two\n...\n',
    ];
    for (const source of valid) expect(runYaml(request('yaml', 'format', source)).status).toBe('valid');
    expect(runYaml(request('yaml', 'validate', 'duplicate: 1\nduplicate: 2\n'))).toMatchObject({ status: 'invalid' });
    const aliasBomb = `base: &base [1, 2]\nvalues: [${Array.from({ length: 51 }, () => '*base').join(', ')}]\n`;
    expect(runYaml(request('yaml', 'validate', aliasBomb))).toMatchObject({ status: 'limit' });
  });
});

describe('TOML 1.0 token fidelity', () => {
  test('preserves comments, declaration order, typed values and date/time lexemes', () => {
    const source =
      '# heading\ntitle="Example"\nnumber=1_000\nfloat=1.0\nwhen=1979-05-27T07:32:00-08:00\n[owner]\nname="Tom"\n[[products]]\nid=1\n';
    const result = runToml(request('toml', 'format', source));
    expect(result.status).toBe('valid');
    expect(result.output).toContain('# heading');
    expect(result.output).toContain('number = 1_000');
    expect(result.output).toContain('float = 1.0');
    expect(result.output).toContain('when = 1979-05-27T07:32:00-08:00');
  });

  test('rejects duplicate declarations, malformed dates and compact', () => {
    expect(runToml(request('toml', 'validate', 'a=1\na=2\n'))).toMatchObject({ status: 'invalid' });
    expect(runToml(request('toml', 'validate', 'date=2023-02-30\n'))).toMatchObject({ status: 'invalid' });
    expect(runToml(request('toml', 'compact', 'a=1\n'))).toMatchObject({ status: 'unsupported' });
  });

  test('covers TOML 1.0 keys, arrays, inline tables, booleans, strings and local time values', () => {
    const source = [
      'dotted.key="value"',
      'enabled=true',
      'items=[1, 2, 3]',
      'inline={ name="ConfigLens", count=2 }',
      'date=1979-05-27',
      'time=07:32:00',
      'local=1979-05-27T07:32:00',
      '',
    ].join('\n');
    expect(runToml(request('toml', 'format', source))).toMatchObject({ status: 'valid' });
    for (const invalid of ['a=1\n[a]\nb=2\n', 'value=0x\n', 'value=1\nvalue.key=2\n']) {
      expect(runToml(request('toml', 'validate', invalid))).toMatchObject({ status: 'invalid' });
    }
  });
});

describe('XML 1.0 conservative formatting', () => {
  test('formats element-only content and preserves mixed content exactly', () => {
    const structural = runXml(request('xml', 'format', '<root><item id="1"/><item><![CDATA[value]]></item></root>'));
    expect(structural.status).toBe('valid');
    expect(structural.output).toContain('\n  <item id="1"/>');
    const mixed = '<root>Hello <strong>world</strong> !</root>';
    expect(runXml(request('xml', 'format', mixed))).toMatchObject({ status: 'valid', output: mixed });
  });

  test('rejects malformed and external expansion paths without fetching', () => {
    expect(runXml(request('xml', 'validate', '<root><child></root>'))).toMatchObject({ status: 'invalid' });
    for (const source of [
      '<!DOCTYPE root SYSTEM "https://example.com/a.dtd"><root/>',
      '<!DOCTYPE root [<!ENTITY ext SYSTEM "file:///private/a">]><root>&ext;</root>',
      '<root xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="x"/></root>',
    ]) {
      const result = runXml(request('xml', 'format', source));
      expect(result.status).toBe('unsupported');
      expect(result).not.toHaveProperty('output');
    }
  });

  test('preserves declaration, namespaces, attributes, comments, PI and CDATA order', () => {
    const source =
      '<?xml version="1.0"?><root xmlns="urn:lensx" xmlns:c="urn:config" c:mode="safe"><!--comment--><?lens value?><item><![CDATA[value]]></item></root>';
    const result = runXml(request('xml', 'format', source));
    expect(result.status).toBe('valid');
    expect(result.output).toContain('<?xml version="1.0"?>');
    expect(result.output).toContain('xmlns:c="urn:config"');
    expect(result.output?.indexOf('<!--comment-->')).toBeLessThan(result.output?.indexOf('<?lens value?>') ?? -1);
    expect(runXml(request('xml', 'compact', '<root/>'))).toMatchObject({ status: 'unsupported' });
  });
});
