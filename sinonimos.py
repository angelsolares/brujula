"""Diccionario de sinónimos para la búsqueda de testimonios.

Cada grupo junta palabras que un reclutador podría usar para referirse a lo
mismo. Si la búsqueda contiene cualquiera de ellas, se buscan todas las del
grupo. Se puede escribir con acentos y mayúsculas: el servidor los normaliza.

Para ampliar el diccionario basta con agregar palabras a un grupo o crear un
grupo nuevo. Conviene evitar palabras muy cortas o ambiguas (como "tos" o
"tea") y palabras de uso común ("corazón" por "de todo corazón", "sueño" por
soñar, "vista"), porque harían coincidir videos que no tienen que ver. Esas se
pueden seguir buscando tal cual; solo no se usan como sinónimos.
"""

GRUPOS = [
    # Metabólicas
    ["diabetes", "diabético", "diabética", "azúcar", "azúcar alta", "glucosa", "glucemia",
     "insulina", "insulinodependiente", "pie diabético", "cetoacidosis"],
    ["hipertensión", "presión alta", "presión arterial", "presión arterial alta", "tensión alta"],
    ["presión baja", "hipotensión"],
    ["colesterol", "triglicéridos"],
    ["obesidad", "sobrepeso", "bajar de peso", "adelgazar", "kilos de más"],
    ["tiroides", "hipotiroidismo", "hipertiroidismo", "hashimoto"],

    # Corazón y circulación
    ["cardiaco", "cardíaco", "cardiaca", "cardíaca", "infarto", "arritmia", "coronario",
     "coronarias", "cardiovascular", "insuficiencia cardíaca", "problemas cardiacos",
     "problemas del corazón", "enfermedad del corazón"],
    ["circulación", "mala circulación", "várices", "varices", "úlcera varicosa", "trombosis",
     "embolia", "venas"],
    ["anemia", "hierro", "hemoglobina", "anemia ferropénica"],

    # Huesos, articulaciones y músculos
    ["articulación", "articulaciones", "artritis", "artrosis", "osteoartrosis", "reuma",
     "reumatoide", "espondilitis", "rodilla", "dolor de rodilla", "cadera",
     "desgaste de cadera", "dolor articular", "me duele la rodilla", "me duelen las rodillas"],
    ["gota", "ácido úrico"],
    ["hueso", "huesos", "dolor de huesos", "osteoporosis"],
    ["columna", "escoliosis", "hernia discal", "dolor de espalda", "me duele la espalda"],
    ["fibromialgia", "dolor muscular", "dolores musculares", "músculos", "distrofia muscular",
     "miastenia"],
    ["ciática", "nervio ciático", "neuropatía", "hormigueo", "entumecimiento"],

    # Cáncer
    ["cáncer", "tumor", "tumores", "oncológico", "quimioterapia", "quimio", "radioterapia",
     "metástasis", "leucemia", "linfoma", "carcinoma", "neoplasia", "mieloide"],
    ["cáncer de mama", "cáncer de seno"],
    ["próstata", "prostático", "cáncer de próstata"],
    ["cervicouterino", "cuello uterino", "útero", "cáncer cervicouterino"],

    # Respiratorias
    ["asma", "bronquitis", "pulmón", "pulmones", "respirar", "respiración", "respiratorio",
     "epoc", "enfisema", "fibrosis pulmonar", "neumonía", "falta de aire", "falta el aire",
     "me falta el aire", "no puedo respirar", "me cuesta respirar"],
    ["covid", "coronavirus", "covid 19", "covid-19", "covid19", "postcovid", "post covid"],
    ["alergia", "alergias", "alérgico", "alérgica", "rinitis", "sinusitis", "estornudos"],

    # Piel
    ["piel", "dermatitis", "psoriasis", "acné", "vitiligo", "vitíligo", "eczema", "manchas",
     "urticaria", "rosácea", "piel atópica", "herpes"],

    # Digestivo
    ["estómago", "gastritis", "colitis", "reflujo", "úlcera", "digestión", "intestino",
     "colon irritable", "estreñimiento", "diverticulosis", "helicobacter", "problemas estomacales",
     "me duele el estómago", "dolor de estómago"],
    ["hígado", "hígado graso", "cirrosis", "hepatitis", "vesícula", "piedras en la vesícula"],
    ["hemorroides", "almorranas"],

    # Riñón
    ["riñón", "riñones", "renal", "insuficiencia renal", "diálisis", "dialisis", "hemodiálisis",
     "cálculos renales", "piedras en el riñón", "nefritis"],

    # Salud mental y sueño
    ["depresión", "deprimido", "deprimida", "tristeza", "depresión posparto",
     "bipolaridad", "bipolar"],
    ["ansiedad", "estrés", "estresado", "pánico", "ataque de ansiedad", "angustia"],
    ["insomnio", "desvelo", "no podía dormir", "no puedo dormir", "no duermo", "dormir bien"],
    ["adicción", "adicciones", "drogas", "alcoholismo", "alcohol", "fumar", "tabaquismo"],
    ["esquizofrenia", "psicosis"],

    # Sistema nervioso
    ["alzheimer", "demencia", "memoria", "olvidos"],
    ["parkinson", "temblor", "temblores"],
    ["epilepsia", "convulsiones", "crisis convulsivas"],
    ["esclerosis", "esclerosis múltiple"],
    ["migraña", "dolor de cabeza", "dolores de cabeza", "cefalea", "jaqueca", "me duele la cabeza"],
    ["parálisis facial", "parálisis"],
    ["vértigo", "mareo", "mareos"],

    # Defensas e infecciones
    ["defensas", "inmune", "inmunológico", "sistema inmune", "inmunidad",
     "enfermarse seguido", "gripe", "gripa", "resfriado", "infecciones"],
    ["vih", "sida", "vih sida", "seropositivo"],
    ["lupus", "autoinmune", "autoinmunes", "lupus eritematoso", "esclerodermia", "sjögren"],
    ["dengue", "chikungunya", "zika"],
    ["tuberculosis"],

    # Energía
    ["cansancio", "fatiga", "agotamiento", "agotado", "agotada", "fatiga crónica",
     "cansancio crónico"],
    ["energía", "vitalidad", "más energía"],

    # Ojos
    ["visión", "retina", "retinopatía", "glaucoma", "cataratas", "macular",
     "desprendimiento de retina", "problemas de la vista", "perdí la vista"],

    # Mujer y hombre
    ["menopausia", "bochornos", "climaterio"],
    ["infertilidad", "embarazo", "embarazarse", "fertilidad", "quedar embarazada"],
    ["quistes", "quiste", "ovarios", "ovario poliquístico", "miomas", "endometriosis"],
    ["disfunción sexual", "disfunción eréctil", "libido", "impotencia"],

    # Niños y desarrollo
    ["autismo", "autista", "espectro autista", "asperger", "tdah", "hiperactividad",
     "déficit de atención"],
    ["síndrome de down", "down"],
    ["niño", "niños", "niña", "niñas", "bebé", "infantil", "pediátrico"],

    # Mascotas
    ["mascota", "mascotas", "perro", "perrito", "gato", "gatito", "veterinario",
     "veterinaria", "animal"],

    # Deporte
    ["deporte", "deportista", "atleta", "rendimiento", "entrenamiento", "recuperación muscular",
     "gimnasio"],
]

# Palabras sin peso para la búsqueda: no se exige que aparezcan.
VACIAS = {
    "de", "del", "la", "las", "el", "los", "lo", "un", "una", "unos", "unas", "y", "o", "u",
    "a", "al", "en", "con", "sin", "para", "por", "que", "mi", "mis", "su", "sus", "se", "es",
    "me", "le", "les", "muy", "mas", "ya", "como", "tengo", "tiene", "tener", "hay", "algo",
    "testimonio", "testimonios", "video", "videos", "immunocal", "inmunocal",
}
