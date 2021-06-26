import { readFileSync, writeFileSync, readdirSync, readdir  } from 'fs'
import { preprocess } from 'svelte/compiler'
import { suite } from 'uvu'
import { fixture } from 'uvu/assert'

readdirSync('tests/assets/input', {withFileTypes: true}).forEach(dirent => {
  if (dirent.isDirectory()) {
    const test = suite(dirent.name)
    readdirSync('tests/assets/input/' + dirent.name,{withFileTypes: true}).forEach(file => {
      if (file.isFile()) {
        test(dirent.name + '_' + file.name, async () => {
          const input = readFileSync('tests/assets/input/' + dirent.name + '/' + file.name, 'utf-8')
          const expected = readFileSync('tests/assets/expected/' + dirent.name + '/' + file.name, 'utf-8')
          const { code } = await preprocess(input, require('../src/index').windi({
            silent: true
          }), {
            filename: file.name
          })
          fixture(code, expected)
        })
      }
    })
    test.run()
  }
})
