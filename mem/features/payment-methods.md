---
name: Flexible payment methods
description: Payment methods must be fully configurable and must not assume every method receives cryptocurrency.
type: feature
---
Each payment method controls its own display type, labels, visible fields, instructions, and icon from the admin panel. Checkout must render those saved settings rather than infer cryptocurrency behavior from the method name. Cryptocurrency methods also have a separate network image, managed independently from the payment-method icon and shown beside the selected network.