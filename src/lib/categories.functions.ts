/** Compatibility facade for category and product administration functions. */
export {
  prepareCategoryImageUpload,
  getCategoryImageUrl,
  saveCategory,
  deleteCategory,
} from "./categories-write.functions";
export {
  prepareProductImageUpload,
  getProductImageUrl,
  saveProduct,
  deleteProduct,
} from "./products.functions";
