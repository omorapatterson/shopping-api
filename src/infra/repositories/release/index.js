const { Release, ReleaseImage } = require('src/domain/release')
const BaseRepository = require('../base_repository')
const container = require('src/container') // we have to get the DI
// inject database
const { database } = container.cradle
const model = database.models.releases
const releaseImageModel = database.models.release_images
const styleModel = database.models.styles
const categoriesModel = database.models.categories
const offerModel = database.models.offers

const EntityNotFound = require('src/infra/errors/EntityNotFoundError')
const moment = require('moment')
const Sequelize = require('sequelize')
const Op = Sequelize.Op

const getOptionsCallback = (params) => {
  return {
    include: [
      { model: releaseImageModel, as: 'images' },
      {
        model: styleModel, as: 'style', attributes: ['id', 'brand', 'category'],
        include: [{
          model: categoriesModel,
          as: 'categories'
        }]
      },
      { model: offerModel, as: 'offers', attributes: ['status', 'raffle','shipping'] }
    ],
    distinct: true
  }
}

const filterMappings = {
  brandId: (value) => {
    return {
      filter: { brand: Array.isArray(value) ? { [Op.or]: value } : value },
      model: styleModel
    }
  },
  categoryId: (value) => {
    return {
      filter: { id: Array.isArray(value) ? { [Op.or]: value } : value },
      model: categoriesModel
    }
  },
  status: (value) => {
    return {
      filter: { status: Array.isArray(value) ? { [Op.or]: value } : value },
      model: offerModel
    }
  },
  shipping: (value) => {
    return {
      filter: { shipping: Array.isArray(value) ? { [Op.or]: value } : value },
      model: offerModel
    }
  },
  outdated: (value) => {
    const date = new Date(moment.utc().format('YYYY-MM-DD'))
    return {
      // with date past today and not null
      filter: { releaseDate: { [Op.lt]: date, [Op.ne]: null } }
    }
  },
  coming: (value) => {
    const date = new Date(moment.utc().format('YYYY-MM-DD'))
    return {
      filter: { releaseDate: { [Op.gte]: date, [Op.ne]: null } }
    }
  },
  upcoming: (value) => {
    if (parseInt(value) === 0) {
      return {
        filter: { releaseDate: { [Op.ne]: null } }
      }
    }
    return {
      filter: { releaseDate: null }
    }
  },
  minPriceEUR: (value) => {
    return {
      filter: { priceEUR: { [Op.gte]: parseFloat(value) } }
    }
  },
  maxPriceEUR: (value) => {
    return {
      filter: { priceEUR: { [Op.lte]: parseFloat(value) } }
    }
  },
  minPriceGBP: (value) => {
    return {
      filter: { priceGBP: { [Op.gte]: parseFloat(value) } }
    }
  },
  maxPriceGBP: (value) => {
    return {
      filter: { priceGBP: { [Op.lte]: parseFloat(value) } }
    }
  },
  minPriceUSD: (value) => {
    return {
      filter: { priceUSD: { [Op.gte]: parseFloat(value) } }
    }
  },
  maxPriceUSD: (value) => {
    return {
      filter: { priceUSD: { [Op.lte]: parseFloat(value) } }
    }
  },
  fromDate: (value) => {
    return {
      filter: { releaseDate: { [Op.gte]: moment.utc(value) } }
    }
  },
  toDate: (value) => {
    return {
      filter: { releaseDate: { [Op.lte]: moment.utc(value) } }
    }
  },
  gender: (value) => {
    return {
      filter: { gender: Array.isArray(value) ? { [Op.or]: [...value, 'u'] } : { [Op.or]: [value, 'u'] } }
    }
  },
  color: (value) => {
    const colors = Array.isArray(value) ? value : [value]
    const likes = []
    colors.forEach(color => {
      likes.push({ [Op.like]: `%${color}%` })
    })
    return {
      filter: { color: { [Op.or]: likes } }
    }
  },
  query: (value) => {
    const words = value.split(/\s+/g);
    const likes = []
    words.forEach(word => {
      likes.push({ [Op.like]: `%${word}%` })
    })
    return {
      filter: { [Op.or]: {
          name: { [Op.and]: likes },
          sku: { [Op.and]: likes }
      }}
    }
  }
}

const repository = BaseRepository(model, Release, { getOptionsCallback, filterMappings })

/**
 * Associates images to the release
 * @param id
 * @param images
 * @returns {Promise<Array<Model>>}
 */
const createImages = async (id, images) => {
  const release = await model.findOne({
    where: { id }
  })
  if (!release) {
    throw new EntityNotFound()
  }
  const newImages = await releaseImageModel.bulkCreate(images)
  await release.addImages(newImages)
  return newImages
}

/**
 * Get all images associated with a release
 * @param id
 * @returns {Promise<*>}
 */
const getAllImages = async (id) => {
  const release = await model.findOne({
    where: { id }
  })
  if (!release) {
    throw new EntityNotFound()
  }
  const images = release.getImages()
  if (!images) {
    return []
  }
  return images.map((data) => {
    const { dataValues } = data
    return ReleaseImage(dataValues)
  })
}

/**
 * Fetches all releases after date
 * @param date
 * @returns {Promise<*[]>}
 */
const getPastReleases = async (date) => {
  const releases = await model.findAll({
    where: { releaseDate: { [Op.lt]: date } }
  })
  return releases.map((data) => {
    return Release(data)
  })
}

const countLikeReleases = async (slug) => {
  const releases = await model.findAll({
    where: { slug: { [Op.like]: `${slug}%` } }
  })
  if (!releases) return 0
  return releases.length
}

/**
 * Delete image from release
 * @param id
 * @returns {*}
 */
const destroyImage = (id) => releaseImageModel.destroy({ where: { id } })

/**
 * Update hiddenDashboard
 * @param id
 * @returns {*}
 */
const setHiddenDashboard = (id, hiddenDashboard) => model.update({ hiddenDashboard: hiddenDashboard }, { where: { id } })

const modifyUpdatedAt = (id, updatedAt) => database.sequelize.query('update releases set updatedAt=:updatedAt where id=:id', {replacements: { updatedAt, id }})


Object.assign(repository, {
  createImages,
  destroyImage,
  getAllImages,
  getPastReleases,
  setHiddenDashboard,
  countLikeReleases,
  modifyUpdatedAt
})

module.exports = repository
