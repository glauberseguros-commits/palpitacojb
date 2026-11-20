import { useMemo, useState } from 'react'
import './CabecaDeMilhar.css'

const ANIMALS = [
  { group: 1, name: 'Avestruz', tens: ['01', '02', '03', '04'] },
  { group: 2, name: 'Águia', tens: ['05', '06', '07', '08'] },
  { group: 3, name: 'Burro', tens: ['09', '10', '11', '12'] },
  { group: 4, name: 'Borboleta', tens: ['13', '14', '15', '16'] },
  { group: 5, name: 'Cachorro', tens: ['17', '18', '19', '20'] },
  { group: 6, name: 'Cabra', tens: ['21', '22', '23', '24'] },
  { group: 7, name: 'Carneiro', tens: ['25', '26', '27', '28'] },
  { group: 8, name: 'Camelo', tens: ['29', '30', '31', '32'] },
  { group: 9, name: 'Cobra', tens: ['33', '34', '35', '36'] },
  { group: 10, name: 'Coelho', tens: ['37', '38', '39', '40'] },
  { group: 11, name: 'Cavalo', tens: ['41', '42', '43', '44'] },
  { group: 12, name: 'Elefante', tens: ['45', '46', '47', '48'] },
  { group: 13, name: 'Galo', tens: ['49', '50', '51', '52'] },
  { group: 14, name: 'Gato', tens: ['53', '54', '55', '56'] },
  { group: 15, name: 'Jacaré', tens: ['57', '58', '59', '60'] },
  { group: 16, name: 'Leão', tens: ['61', '62', '63', '64'] },
  { group: 17, name: 'Macaco', tens: ['65', '66', '67', '68'] },
  { group: 18, name: 'Porco', tens: ['69', '70', '71', '72'] },
  { group: 19, name: 'Pavão', tens: ['73', '74', '75', '76'] },
  { group: 20, name: 'Peru', tens: ['77', '78', '79', '80'] },
  { group: 21, name: 'Touro', tens: ['81', '82', '83', '84'] },
  { group: 22, name: 'Tigre', tens: ['85', '86', '87', '88'] },
  { group: 23, name: 'Urso', tens: ['89', '90', '91', '92'] },
  { group: 24, name: 'Veado', tens: ['93', '94', '95', '96'] },
  { group: 25, name: 'Vaca', tens: ['97', '98', '99', '00'] },
]

function imagemPalpitaco(grupo, nome) {
  return `/assets/animals/animais_128_png/${grupo}_${normalizeText(nome)}.png`
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function findMatchingAnimal(animal, bichos) {
  if (!Array.isArray(bichos)) {
    return null
  }

  return (
    bichos.find((item) => {
      const numericCandidates = [
        item?.group,
        item?.grupo,
        item?.id,
        item?.numero,
        item?.codigo,
      ]
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))

      if (numericCandidates.includes(Number(animal.group))) {
        return true
      }

      const itemName = normalizeText(
        item?.name || item?.nome || item?.title || '',
      )

      return itemName === normalizeText(animal.name)
    }) || null
  )
}

function resolveAnimalImage(
  animal,
  bichos,
  getBichoImage,
) {
  if (typeof getBichoImage !== 'function') {
    return ''
  }

  const matchedAnimal =
    findMatchingAnimal(
      animal,
      bichos,
    )

  const grupo =
    String(
      matchedAnimal?.grupo ??
      animal.group,
    ).padStart(2, '0')

  const nome =
    matchedAnimal?.nome ??
    animal.name

  try {
    return (
      getBichoImage(
        grupo,
        nome,
      ) || ''
    )
  } catch {
    return ''
  }
}

export default function CabecaDeMilhar({
  bichos = [],
  getBichoImage = imagemPalpitaco,
}) {
  const [head, setHead] = useState('')
  const [selected, setSelected] = useState([])
  const [generated, setGenerated] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedGroup, setCopiedGroup] = useState(null)
  const [copyError, setCopyError] = useState('')

  const headParts = useMemo(
    () =>
      head
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    [head],
  )

  const validHead =
    headParts.length > 0 &&
    headParts.every((value) => /^\d{2}$/.test(value))

  const heads = useMemo(
    () =>
      validHead
        ? [...new Set(headParts)]
        : [],
    [headParts, validHead],
  )

  const catalog = useMemo(
    () =>
      ANIMALS.map((animal) => ({
        ...animal,
        imageSrc: resolveAnimalImage(
          animal,
          bichos,
          getBichoImage,
        ),
      })),
    [bichos, getBichoImage],
  )

  const selectedAnimals = useMemo(
    () =>
      catalog
        .filter((animal) => selected.includes(animal.group))
        .map((animal) => {
          const columns = animal.tens.map((ten) => ({
            ten,
            thousands: heads
              .map((headValue) => `${headValue}${ten}`)
              .sort(),
          }))

          return {
            ...animal,
            columns,
            thousands: columns.flatMap(
              (column) => column.thousands,
            ),
          }
        }),
    [catalog, selected, heads],
  )

  const totalThousands = selectedAnimals.reduce(
    (total, animal) =>
      total + animal.thousands.length,
    0,
  )

  function handleHeadChange(event) {
    const value = event.target.value.replace(
      /[^\d,\s]/g,
      '',
    )

    setHead(value)
    setGenerated(false)
    setCopied(false)
  }

  function toggleAnimal(group) {
    setSelected((current) =>
      current.includes(group)
        ? current.filter((item) => item !== group)
        : [...current, group],
    )

    setGenerated(false)
    setCopied(false)
  }

  function selectAll() {
    setSelected(catalog.map((animal) => animal.group))
    setGenerated(false)
    setCopied(false)
  }

  function clearAll() {
    setSelected([])
    setGenerated(false)
    setCopied(false)
  }

  function generate() {
    if (!validHead || selected.length === 0) {
      return
    }

    setGenerated(true)
    setCopied(false)
  }

  async function copiarTexto(texto) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return
    }

    const campo = document.createElement('textarea')
    campo.value = texto
    campo.style.position = 'fixed'
    campo.style.opacity = '0'
    document.body.appendChild(campo)
    campo.select()

    const sucesso = document.execCommand('copy')
    campo.remove()

    if (!sucesso) {
      throw new Error('Não foi possível copiar.')
    }
  }

  async function copyAll() {
    try {
      const numeros = selectedAnimals.flatMap(
        (animal) => animal.thousands,
      )

      await copiarTexto(numeros.join('\n'))
      setCopied(true)
      setCopyError('')

      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopyError('Não foi possível copiar as milhares.')
    }
  }

  async function copyAnimal(animal) {
    try {
      await copiarTexto(animal.thousands.join('\n'))
      setCopiedGroup(animal.group)
      setCopyError('')

      window.setTimeout(() => setCopiedGroup(null), 1800)
    } catch {
      setCopyError('Não foi possível copiar as milhares.')
    }
  }

  return (
    <main className="cabeca-page">
      <section className="cabeca-shell">

        <section className="cabeca-panel">
          <label
            className="cabeca-label"
            htmlFor="milhar-head"
          >
            Cabeças da milhar
          </label>

          <input
            id="milhar-head"
            className="cabeca-input"
            inputMode="text"
            autoComplete="off"
            placeholder="01, 02, 03, 04"
            value={head}
            onChange={handleHeadChange}
          />

          <span className="cabeca-hint">
            Use 2 números por cabeça e separe por
            vírgula. Ex.: 01, 02, 03, 04.
          </span>
        </section>

        <section className="cabeca-panel">
          <div className="cabeca-section-top">
            <div>
              <h2>Escolha os bichos</h2>
              <p>Selecione quantos quiser.</p>
            </div>

            <div className="cabeca-mini-actions">
              <button
                type="button"
                onClick={selectAll}
              >
                Todos
              </button>

              <button
                type="button"
                onClick={clearAll}
              >
                Limpar
              </button>
            </div>
          </div>

          <div className="cabeca-animal-grid">
            {catalog.map((animal) => {
              const active = selected.includes(
                animal.group,
              )

              return (
                <button
                  key={animal.group}
                  type="button"
                  className={`cabeca-animal ${
                    active ? 'is-active' : ''
                  }`}
                  onClick={() =>
                    toggleAnimal(animal.group)
                  }
                  aria-pressed={active}
                >
                  <div className="cabeca-animal-top">
                    <div className="cabeca-animal-photo-shell">
                      {animal.imageSrc ? (
                        <img
                          src={animal.imageSrc}
                          alt={animal.name}
                          className="cabeca-animal-photo"
                          draggable="false"
                        />
                      ) : (
                        <div className="cabeca-animal-photo-fallback">
                          {String(animal.group).padStart(2, '0')}
                        </div>
                      )}
                    </div>

                    <div className="cabeca-animal-meta">
                      <span className="cabeca-group">
                        {String(animal.group).padStart(
                          2,
                          '0',
                        )}
                      </span>

                      <strong>{animal.name}</strong>

                      <span className="cabeca-tens">
                        {animal.tens.join(' • ')}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section className="cabeca-summary">
          <div>
            <strong>{selected.length}</strong>
            <span>
              {selected.length === 1
                ? 'bicho'
                : 'bichos'}
            </span>
          </div>

          <div>
            <strong>{totalThousands}</strong>
            <span>milhares</span>
          </div>
        </section>

        <button
          type="button"
          className="cabeca-generate"
          disabled={!validHead || selected.length === 0}
          onClick={generate}
        >
          GERAR MILHARES
        </button>

        {generated && (
          <section className="cabeca-results">
            <div className="cabeca-results-header">
              <div>
                <span>RESULTADO</span>
                <h2>
                  {heads.length === 1
                    ? 'Cabeça'
                    : 'Cabeças'}{' '}
                  {heads.join(', ')} • {totalThousands}{' '}
                  milhares
                </h2>
              </div>

              <button
                type="button"
                onClick={copyAll}
              >
                {copied ? 'COPIADO!' : 'COPIAR TODAS'}
              </button>
            </div>

            <div className="cabeca-result-list">
              {selectedAnimals.map((animal) => (
                <article
                  key={animal.group}
                  className="cabeca-result-card"
                >
                  <div className="cabeca-result-title">
                    <div className="cabeca-result-animal">
                      <div className="cabeca-result-photo-shell">
                        {animal.imageSrc ? (
                          <img
                            src={animal.imageSrc}
                            alt={animal.name}
                            className="cabeca-result-photo"
                            draggable="false"
                          />
                        ) : (
                          <div className="cabeca-result-photo-fallback">
                            {String(
                              animal.group,
                            ).padStart(2, '0')}
                          </div>
                        )}
                      </div>

                      <div className="cabeca-result-meta">
                        <span>
                          Grupo{' '}
                          {String(
                            animal.group,
                          ).padStart(2, '0')}
                        </span>
                        <strong>{animal.name}</strong>
                      </div>
                    </div>
                  </div>

                                    <div className="cabeca-dezenas-grid">
                    {animal.columns.map((column) => (
                      <section
                        className="cabeca-dezena-column"
                        key={column.ten}
                      >
                        <div className="cabeca-dezena-heading">
                          <strong>{column.ten}</strong>
                          <small>{column.thousands.length}</small>
                        </div>

                        <div className="cabeca-dezena-list">
                          {column.thousands.map((numero) => (
                            <span key={numero}>
                              {numero}
                            </span>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                  <div className="cabeca-card-actions">
                    <button
                      type="button"
                      onClick={() => copyAnimal(animal)}
                    >
                      {copiedGroup === animal.group
                        ? 'COPIADO!'
                        : `Copiar ${animal.thousands.length}`}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {copyError && (
          <p className="cabeca-copy-error" role="alert">
            {copyError}
          </p>
        )}
      </section>
    </main>
  )
}
